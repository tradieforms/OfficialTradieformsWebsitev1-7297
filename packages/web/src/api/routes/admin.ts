import { desc, inArray } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { withUser } from "../middleware/auth";
import { adminOnly } from "../middleware/admin";
import { adminEmails, isAdmin, isPendingAdmin } from "../lib/admin";
import type { QuoteLineSummary } from "./shipping-quotes";

/**
 * Internal admin tools. Order lists here include SKU / supplier columns, so every
 * procedure that returns them is admin-only. Supplier cost is never stored on orders.
 */
export const admin = {
  /** Whether the current user can open admin tools (never reveals the allowlist). */
  status: withUser.handler(({ context }) => ({
    signedIn: Boolean(context.user),
    admin: isAdmin(context.user),
    /** Listed address that still needs a verified sign-in (Google/Apple) before admin opens. */
    needsVerification: isPendingAdmin(context.user),
    configured: adminEmails().length > 0,
  })),

  orders: adminOnly.handler(async () => {
    const orders = await db.select().from(schema.orders).orderBy(desc(schema.orders.id)).limit(200);
    const ids = orders.map((o) => o.id);
    const items = ids.length
      ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, ids))
      : [];
    return orders.map((o) => {
      const own = items.filter((i) => i.orderId === o.id);
      return {
        reference: o.reference,
        createdAt: o.createdAt,
        customerName: o.customerName,
        company: o.company,
        email: o.email,
        total: o.total,
        subtotal: o.subtotal,
        embroideryFee: o.embroideryFee,
        embroideredPieces: o.embroideredPieces,
        shippingCharge: o.shippingCharge,
        shippingZone: o.shippingZone,
        shippingZoneOverride: o.shippingZoneOverride,
        shippingWeightGrams: o.shippingWeightGrams,
        shipPostcode: o.shipPostcode,
        shipSuburb: o.shipSuburb,
        shipState: o.shipState,
        shippingFlags: o.shippingFlags,
        status: o.status,
        paymentStatus: o.paymentStatus,
        lines: own.map((i) => ({
          productName: i.productName,
          kind: i.kind,
          colourName: i.colourName,
          size: i.size,
          quantity: i.quantity,
          sku: i.sku,
          decorationMethod: i.decorationMethod,
        })),
        unmappedSkus: own.filter((i) => i.kind === "product" && !i.sku).length,
      };
    });
  }),

  /** Shipping quote requests (carts over the 30 kg shipping table), newest first. */
  shippingQuotes: adminOnly.handler(async () => {
    const rows = await db
      .select()
      .from(schema.shippingQuoteRequests)
      .orderBy(desc(schema.shippingQuoteRequests.id))
      .limit(200);
    return rows.map(({ cartLines: _cart, linesSummary, shippingFlags, ...r }) => ({
      ...r,
      lines: JSON.parse(linesSummary) as QuoteLineSummary[],
      flags: shippingFlags ? (JSON.parse(shippingFlags) as string[]) : [],
    }));
  }),
};
