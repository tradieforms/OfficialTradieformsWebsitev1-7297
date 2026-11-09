/**
 * Order totals shared by orders.quote and orders.create: garments, embroidery and
 * shipping, all recomputed on the server from the catalogue (the browser only ever
 * sends the configuration, a postcode and an optional zone correction).
 */
import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { getProduct, getVariant } from "../../shared/catalogue";
import { quoteShipping, type ShippingQuote, type WeightItem } from "../../shared/shipping";

export const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;

export const zoneInput = z.enum(["metro", "regional"]);

export const shippingAddressInput = z.object({
  address1: z.string().trim().min(3).max(160),
  address2: z.string().trim().max(160).optional().nullable(),
  suburb: z.string().trim().min(2).max(80),
  state: z.enum(AU_STATES),
  postcode: z.string().trim().regex(/^\d{4}$/, "Enter a 4-digit Australian postcode"),
  /** Customer correction of the detected metro/regional zone (flagged on the order). */
  zone: zoneInput.optional().nullable(),
});

/** The minimum each priced line must expose for totals. */
export interface TotalsLine {
  kind: "product" | "bundle";
  slug: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  embroideryFee: number;
  embroideredPieces: number;
  sizes?: { slug: string; quantity: number; variantId: string }[];
}

/** Every physical garment on the order with its catalogue shipping weight. */
export function weightItems(lines: TotalsLine[]): WeightItem[] {
  const items: WeightItem[] = [];
  for (const line of lines) {
    if (line.kind === "product") {
      const product = getProduct(line.slug)!;
      const variant = getVariant(product, line.variantId)!;
      items.push({ name: product.name, quantity: line.quantity, weightKg: variant.weightKg ?? null });
      continue;
    }
    for (const s of line.sizes ?? []) {
      const product = getProduct(s.slug)!;
      const variant = getVariant(product, s.variantId)!;
      items.push({
        name: product.name,
        quantity: s.quantity * line.quantity,
        weightKg: variant.weightKg ?? null,
      });
    }
  }
  return items;
}

export interface OrderTotals {
  /** Garments only (after any bundle rate), integer cents. */
  subtotal: number;
  embroideryFee: number;
  embroideredPieces: number;
  shipping: ShippingQuote;
  /** subtotal + embroidery + shipping (shipping counted only when known). */
  total: number;
  /** True when every part of the total is known and checkout may proceed. */
  complete: boolean;
}

export function orderTotals(
  lines: TotalsLine[],
  postcode: string | null | undefined,
  zone?: "metro" | "regional" | null,
): OrderTotals {
  const embroideryFee = lines.reduce((s, l) => s + l.embroideryFee, 0);
  const embroideredPieces = lines.reduce((s, l) => s + l.embroideredPieces, 0);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal - l.embroideryFee, 0);
  const shipping = quoteShipping(weightItems(lines), postcode, zone ?? null);
  return {
    subtotal,
    embroideryFee,
    embroideredPieces,
    shipping,
    total: subtotal + embroideryFee + (shipping.charge ?? 0),
    complete: shipping.status === "ok",
  };
}

/** Refuses to create an order whose shipping can't be priced from the supplied table. */
export function assertShippable(totals: OrderTotals) {
  const s = totals.shipping;
  if (s.status === "custom_quote")
    throw new ORPCError("BAD_REQUEST", {
      message: `${s.message} Request a custom shipping quote from your cart or checkout page.`,
    });
  if (s.status !== "ok" || s.charge == null)
    throw new ORPCError("BAD_REQUEST", {
      message: s.message ?? "Enter a valid Australian delivery postcode to calculate shipping.",
    });
}
