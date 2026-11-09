import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { withUser } from "../middleware/auth";
import { AU_STATES, orderTotals, zoneInput } from "../lib/order-pricing";
import { BUSINESS_INBOX, MailerNotConfigured, notificationEmail, sendMail } from "../lib/mailer";
import { formatAUD } from "../../shared/catalogue";
import { formatKg, zoneLabel } from "../../shared/shipping";
import { cartLine, priceLine, type PricedLine } from "./orders";
import { enforceLimit } from "../lib/rate-limit";
import { randomReference } from "../lib/order-access";
import { singleLine } from "../lib/spam-guard";


/** What staff need to quote freight: every line as the server priced it (no supplier fields). */
function summarise(lines: PricedLine[]) {
  return lines.map((l) => ({
    kind: l.kind,
    productName: l.productName,
    colourName: l.colourName,
    size: l.size,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
    unitWeightKg: l.unitWeightKg,
    decorationMethod: l.decorationMethod,
    logoKey: l.logoKey,
    garments: l.garments?.map((g) => ({
      name: g.name,
      colourName: g.colourName,
      pieces: g.pieces,
      sizes: g.sizes,
    })),
  }));
}

export type QuoteLineSummary = ReturnType<typeof summarise>[number];

/**
 * Shipping quote requests for carts over the 30 kg shipping table. The request is always
 * stored (staff see it under Admin → Shipping quotes); the business-inbox email is a
 * best-effort extra and the customer is never told it failed — the stored copy is the record.
 */
export const shippingQuotes = {
  request: withUser
    .input(
      z.object({
        contact: z.object({
          name: z.string().trim().min(2, "Enter your name").max(120).transform(singleLine),
          email: z.string().trim().email("Enter a valid email address").max(200),
          phone: z
            .string()
            .trim()
            .max(40)
            .regex(/^[+\d\s()-]*$/, "Enter a valid phone number")
            .optional()
            .nullable(),
          company: z.string().trim().max(120).transform(singleLine).optional().nullable(),
        }),
        delivery: z.object({
          address1: z.string().trim().max(160).optional().nullable(),
          suburb: z.string().trim().min(2, "Enter the suburb or town").max(80),
          state: z.enum(AU_STATES),
          postcode: z.string().trim().regex(/^\d{4}$/, "Enter a 4-digit Australian postcode"),
          zone: zoneInput.optional().nullable(),
        }),
        notes: z.string().trim().max(1000).optional().nullable(),
        lines: z.array(cartLine).min(1).max(60),
      }),
    )
    .handler(async ({ input, context }) => {
      enforceLimit("shipping-quote", context.headers);
      const lines = input.lines.map(priceLine);
      const totals = orderTotals(lines, input.delivery.postcode, input.delivery.zone);
      const ship = totals.shipping;
      if (ship.status === "ok")
        throw new ORPCError("BAD_REQUEST", {
          message: `This order ships at our standard rate (${formatAUD(ship.charge ?? 0)}), so no custom quote is needed — you can check out now.`,
        });
      if (ship.status !== "custom_quote")
        throw new ORPCError("BAD_REQUEST", {
          message: ship.message ?? "We couldn't work out the shipping weight of this cart.",
        });

      const email = input.contact.email.toLowerCase();
      const summary = summarise(lines);
      const [row] = await db
        .insert(schema.shippingQuoteRequests)
        .values({
          reference: randomReference("SQ"),
          userId: context.user?.id ?? null,
          name: input.contact.name,
          email,
          phone: input.contact.phone || null,
          company: input.contact.company || null,
          address1: input.delivery.address1 || null,
          suburb: input.delivery.suburb,
          state: input.delivery.state,
          postcode: input.delivery.postcode,
          zone: ship.zone,
          zoneDetected: ship.detectedZone,
          zoneOverride: ship.zoneOverride,
          weightGrams: ship.grams,
          pieces: ship.pieces,
          subtotal: totals.subtotal,
          embroideryFee: totals.embroideryFee,
          linesSummary: JSON.stringify(summary),
          cartLines: JSON.stringify(input.lines),
          shippingFlags: JSON.stringify(ship.flags),
          notes: input.notes || null,
        })
        .returning();

      const itemsText = summary
        .map((l) => `${l.quantity}× ${l.productName} — ${l.colourName} ${l.kind === "bundle" ? "" : l.size}`.trim())
        .join("\n");
      const { text, html } = notificationEmail(`Shipping quote request ${row.reference}`, [
        ["Name", row.name],
        ["Email", email],
        ["Phone", row.phone],
        ["Company", row.company],
        ["Deliver to", [row.address1, row.suburb, row.state, row.postcode].filter(Boolean).join(", ")],
        ["Zone", `${zoneLabel(row.zone as "metro" | "regional" | null)}${row.zoneOverride ? " (customer corrected)" : ""}`],
        ["Weight", `${formatKg(row.weightGrams)} · ${row.pieces} garments`],
        ["Garments + embroidery", formatAUD(row.subtotal + row.embroideryFee)],
        ["Items", itemsText],
        ["Notes", row.notes],
      ]);

      let deliveryStatus: "sent" | "failed" | "not_configured" = "sent";
      let deliveryError: string | null = null;
      try {
        await sendMail({
          to: BUSINESS_INBOX,
          subject: `Shipping quote request ${row.reference} — ${row.name} (${formatKg(row.weightGrams)})`,
          text,
          html,
          replyTo: email,
        });
      } catch (err) {
        deliveryStatus = err instanceof MailerNotConfigured ? "not_configured" : "failed";
        deliveryError = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        console.error("[shipping-quote] notification not sent", row.reference, deliveryError);
      }
      await db
        .update(schema.shippingQuoteRequests)
        .set({ deliveryStatus, deliveryError })
        .where(eq(schema.shippingQuoteRequests.id, row.id));

      return {
        reference: row.reference,
        email,
        createdAt: row.createdAt,
        weightGrams: row.weightGrams,
        pieces: row.pieces,
      };
    }),
};
