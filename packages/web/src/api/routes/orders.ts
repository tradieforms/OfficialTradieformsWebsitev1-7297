import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { authed, withUser } from "../middleware/auth";
import {
  colourOffered,
  getProduct,
  getVariant,
  priceKit,
  variantDisplayName,
  type KitEntry,
  type Product,
  type ProductVariant,
} from "../../shared/catalogue";
import { productionFields } from "../lib/supplier-catalogue";
import { offersBack, type PlacedLogo } from "../../shared/placements";
import { placedLogoInput as transform, resolveOrThrow, stringifyLogo } from "../lib/placement-input";
import { EMBROIDERY_FEE, embroideryFee, garmentMethod, type DecorationMethod } from "../../shared/decoration";
import { assertShippable, orderTotals, shippingAddressInput, zoneInput } from "../lib/order-pricing";
import { enforceLimit } from "../lib/rate-limit";
import { canAccessOrder, newAccessToken, publicOrder, randomReference } from "../lib/order-access";
import { logoKeyInput } from "../lib/logo-key";
import { paymentStatusInfo, startOrderPayment, verifyOrderPayment } from "../lib/order-payment";

/** Order lookups: reference + the access token from checkout (or the signed-in owner / admin). */
const orderLookup = z.object({
  reference: z.string().min(3).max(40),
  token: z.string().max(100).optional().nullable(),
});

const sizeBreakdown = z.object({
  slug: z.string(),
  size: z.string(),
  quantity: z.number().int().min(1).max(999),
  colourId: z.string().optional(),
  variantId: z.string().max(40).optional(),
});

/** One garment (product + colour) in a bundle kit, with its own front/back logo. */
const kitPlacement = z.object({
  slug: z.string(),
  colourId: z.string(),
  frontLogo: transform.nullable(),
  backLogo: transform.nullable(),
});

export const cartLine = z.object({
  kind: z.enum(["product", "bundle"]),
  slug: z.string(),
  variantId: z.string().max(40).optional(),
  colourId: z.string().optional(),
  size: z.string().optional(),
  quantity: z.number().int().min(1).max(999),
  logoKey: logoKeyInput.nullable().optional(),
  frontLogo: transform.nullable().optional(),
  backLogo: transform.nullable().optional(),
  sizes: z.array(sizeBreakdown).optional(),
  colourIds: z.record(z.string(), z.string()).optional(),
  placements: z.array(kitPlacement).max(60).optional(),
});

export type CartLineInput = z.infer<typeof cartLine>;

export interface PricedLine {
  kind: "product" | "bundle";
  slug: string;
  productName: string;
  bundleId: string | null;
  /** Single-product lines: the chosen variant (customer-facing fields only). */
  variantId: string | null;
  variantName: string | null;
  material: string | null;
  unitWeightKg: number | null;
  colourId: string;
  colourName: string;
  size: string;
  quantity: number;
  /** Garment price per unit (single product) or per kit (bundle), before embroidery. */
  unitPrice: number;
  /** Embroidery fee per unit of this line (per garment, or per kit for bundles). */
  unitEmbroideryFee: number;
  /** Physical garments on this line carrying the embroidery fee (× quantity). */
  embroideredPieces: number;
  /** Embroidery fee for the whole line (= unitEmbroideryFee × quantity). */
  embroideryFee: number;
  /** "print" | "embroidery" | "mixed" (some garments / views of each) | null (no logo). */
  decorationMethod: DecorationMethod | "mixed" | null;
  /** (unitPrice + unitEmbroideryFee) × quantity. */
  lineTotal: number;
  logoKey: string | null;
  frontLogo: string | null;
  backLogo: string | null;
  sizes?: {
    slug: string;
    name: string;
    size: string;
    quantity: number;
    colourId?: string;
    variantId: string;
  }[];
  colourIds?: Record<string, string>;
  /** Bundle kits: one entry per garment (product + colour) with its own placement. */
  garments?: KitGarment[];
}

export interface KitGarment {
  slug: string;
  /** Customer-facing name (the variant name when the product has options). */
  name: string;
  variantId: string;
  variantName: string;
  material: string;
  colourId: string;
  colourName: string;
  hasBack: boolean;
  pieces: number;
  sizes: { size: string; quantity: number }[];
  /** null = no logo on that view. Includes placementId + production spec. */
  frontLogo: PlacedLogo | null;
  backLogo: PlacedLogo | null;
  /** True when the kit has a logo but no saved placement for this garment (older carts). */
  placementPending: boolean;
  /** Garment-level method summary (front/back methods live on the logos). */
  method: DecorationMethod | "mixed" | null;
  /** Embroidery fee for this garment group in ONE kit (A$16 × pieces when embroidered). */
  embroideryFee: number;
}

/**
 * Groups a validated kit by garment (product + variant + colour) and attaches each
 * garment's placement. Placements are chosen per product + colour (variants of a product
 * share the same garment photo), and every placement is re-resolved from the catalogue to
 * one of that garment's fixed spots.
 */
function kitGarments(sizes: NonNullable<PricedLine["sizes"]>, line: CartLineInput): KitGarment[] {
  const groups = new Map<string, KitGarment>();
  for (const s of sizes) {
    const key = `${s.slug}|${s.variantId}|${s.colourId}`;
    const product = getProduct(s.slug)!;
    const variant = getVariant(product, s.variantId)!;
    const colour = product.colours.find((c) => c.id === s.colourId)!;
    let g = groups.get(key);
    if (!g) {
      g = {
        slug: s.slug,
        name: variantDisplayName(product, variant),
        variantId: variant.id,
        variantName: variant.name,
        material: [variant.material, variant.fabricWeight].filter(Boolean).join(", "),
        colourId: colour.id,
        colourName: colour.name,
        hasBack: offersBack(product),
        pieces: 0,
        sizes: [],
        frontLogo: null,
        backLogo: null,
        placementPending: Boolean(line.logoKey),
        method: null,
        embroideryFee: 0,
      };
      groups.set(key, g);
    }
    g.pieces += s.quantity;
    const same = g.sizes.find((x) => x.size === s.size);
    if (same) same.quantity += s.quantity;
    else g.sizes.push({ size: s.size, quantity: s.quantity });
  }

  if (!line.logoKey) return [...groups.values()];

  for (const p of line.placements ?? []) {
    const matching = [...groups.values()].filter((g) => g.slug === p.slug && g.colourId === p.colourId);
    if (!matching.length)
      throw new ORPCError("BAD_REQUEST", {
        message:
          "A logo placement doesn't match any garment in this kit. Go back to the bundle and review the placements.",
      });
    const product = getProduct(p.slug)!;
    const colour = product.colours.find((c) => c.id === p.colourId)!;
    if (p.backLogo?.enabled && !matching[0].hasBack)
      throw new ORPCError("BAD_REQUEST", {
        message: `The ${product.name} doesn't take a back logo. Remove the back logo for this garment.`,
      });
    const front = resolveOrThrow(product, colour, "front", p.frontLogo);
    const back = resolveOrThrow(product, colour, "back", p.backLogo);
    for (const g of matching) {
      g.frontLogo = front;
      g.backLogo = back;
      g.placementPending = false;
    }
  }
  // Fee per garment group: once per physical garment, whichever views are embroidered.
  for (const g of groups.values()) {
    g.method = garmentMethod(g.frontLogo, g.backLogo);
    g.embroideryFee = embroideryFee(g.pieces, g.frontLogo, g.backLogo);
  }
  return [...groups.values()];
}

/** Rejects a colour the chosen fabric option isn't made in (e.g. a black 100% cotton polo). */
function assertColourOffered(product: Product, variant: ProductVariant, colourId: string) {
  if (!colourOffered(product, variant.id, colourId)) {
    const colour = product.colours.find((c) => c.id === colourId)?.name ?? colourId;
    throw new ORPCError("BAD_REQUEST", {
      message: `The ${variantDisplayName(product, variant)} (${variant.label}) isn't made in ${colour}. Choose another colour or fabric.`,
    });
  }
}

/**
 * Rebuilds every line from the catalogue so the customer is always charged the
 * current catalogue price, never a price the browser supplied.
 */
export function priceLine(line: CartLineInput): PricedLine {
  if (line.kind === "product") {
    const product = getProduct(line.slug);
    if (!product) throw new ORPCError("BAD_REQUEST", { message: `Unknown product: ${line.slug}` });
    const colour = product.colours.find((c) => c.id === line.colourId);
    if (!colour)
      throw new ORPCError("BAD_REQUEST", {
        message: `Choose a valid colour for the ${product.name}.`,
      });
    if (!line.size || !product.sizes.includes(line.size))
      throw new ORPCError("BAD_REQUEST", { message: `Choose a valid size for the ${product.name}.` });
    const variant = variantOrThrow(product, line.variantId);
    assertColourOffered(product, variant, colour.id);
    const front = resolveOrThrow(product, colour, "front", line.frontLogo);
    const back = offersBack(product) ? resolveOrThrow(product, colour, "back", line.backLogo) : null;
    // No uploaded logo = nothing to decorate, so no method and no fee.
    const method = line.logoKey ? garmentMethod(front, back) : null;
    const unitFee = line.logoKey ? embroideryFee(1, front, back) : 0;

    return {
      kind: "product",
      slug: product.slug,
      productName: variantDisplayName(product, variant),
      bundleId: null,
      variantId: variant.id,
      variantName: variant.name,
      material: [variant.material, variant.fabricWeight].filter(Boolean).join(", ") || null,
      unitWeightKg: variant.weightKg ?? null,
      colourId: colour.id,
      colourName: colour.name,
      size: line.size,
      quantity: line.quantity,
      unitPrice: variant.price,
      unitEmbroideryFee: unitFee,
      embroideredPieces: unitFee ? line.quantity : 0,
      embroideryFee: unitFee * line.quantity,
      decorationMethod: method,
      lineTotal: (variant.price + unitFee) * line.quantity,
      logoKey: line.logoKey ?? null,
      frontLogo: stringifyLogo(front),
      backLogo: offersBack(product) ? stringifyLogo(back) : null,
    };
  }

  // Bundle: the customer chooses the mix. Every entry is validated against the
  // catalogue, then the whole kit is priced by its piece count (see priceKit).
  const entries: KitEntry[] = [];
  const sizes: NonNullable<PricedLine["sizes"]> = [];
  for (const entry of line.sizes ?? []) {
    const product = getProduct(entry.slug);
    if (!product) throw new ORPCError("BAD_REQUEST", { message: `Unknown garment: ${entry.slug}` });
    if (!product.sizes.includes(entry.size))
      throw new ORPCError("BAD_REQUEST", {
        message: `Choose a valid size for the ${product.name}.`,
      });
    const colourId = entry.colourId ?? line.colourIds?.[entry.slug] ?? product.defaultColour;
    if (!product.colours.some((c) => c.id === colourId))
      throw new ORPCError("BAD_REQUEST", {
        message: `Choose a valid colour for the ${product.name}.`,
      });
    const variant = variantOrThrow(product, entry.variantId);
    assertColourOffered(product, variant, colourId);
    entries.push({
      slug: entry.slug,
      size: entry.size,
      quantity: entry.quantity,
      colourId,
      variantId: variant.id,
    });
    sizes.push({
      slug: entry.slug,
      name: variantDisplayName(product, variant),
      size: entry.size,
      quantity: entry.quantity,
      colourId,
      variantId: variant.id,
    });
  }

  const priced = priceKit(entries);
  if (!priced.tier)
    throw new ORPCError("BAD_REQUEST", {
      message: `Bundle pricing starts at ${priced.nextTier?.pieces ?? 0} pieces — this kit has ${priced.pieces}.`,
    });

  // Human-readable breakdown kept on the order line so production sees the mix.
  const breakdown = sizes
    .map((s) => {
      const colour = getProduct(s.slug)?.colours.find((c) => c.id === s.colourId)?.name ?? "";
      return `${s.quantity}× ${s.name} ${colour} ${s.size}`.replace(/\s+/g, " ");
    })
    .join("; ");

  const garments = kitGarments(sizes, line);
  const kitFee = garments.reduce((sum, g) => sum + g.embroideryFee, 0);
  const kitEmbroidered = kitFee / EMBROIDERY_FEE;
  const methods = new Set(garments.map((g) => g.method).filter(Boolean));
  const kitMethod: PricedLine["decorationMethod"] =
    methods.size === 0 ? null : methods.size === 1 ? [...methods][0]! : "mixed";

  return {
    kind: "bundle",
    slug: priced.tier.id,
    productName: `${priced.tier.name} — ${priced.tier.tier} rate (custom mix, ${priced.pieces} pcs)`,
    bundleId: priced.tier.id,
    variantId: null,
    variantName: null,
    material: null,
    unitWeightKg: null,
    colourId: "kit",
    colourName: "Kit mix",
    size: breakdown.slice(0, 2000),
    quantity: line.quantity,
    unitPrice: priced.total,
    unitEmbroideryFee: kitFee,
    embroideredPieces: kitEmbroidered * line.quantity,
    embroideryFee: kitFee * line.quantity,
    decorationMethod: kitMethod,
    lineTotal: (priced.total + kitFee) * line.quantity,
    logoKey: line.logoKey ?? null,
    // Kit placements are per garment (kitConfig); the line itself carries none.
    frontLogo: null,
    backLogo: null,
    sizes,
    colourIds: line.colourIds ?? {},
    garments,
  };
}

function variantOrThrow(product: Product, variantId?: string): ProductVariant {
  const variant = getVariant(product, variantId);
  if (!variant)
    throw new ORPCError("BAD_REQUEST", {
      message: `That ${product.name} option is no longer available. Choose an option again.`,
    });
  return variant;
}

/**
 * INTERNAL fields stored with an order line: SKU, supplier and supplier code (resolved on
 * the server from api/lib/supplier-catalogue.ts — the browser never sends or sees them).
 */
function internalFields(line: PricedLine) {
  if (line.kind === "product") {
    const product = getProduct(line.slug)!;
    const variant = getVariant(product, line.variantId)!;
    return { ...productionFields(product, variant), kitProduction: null };
  }
  const kit = (line.garments ?? []).map((g) => {
    const product = getProduct(g.slug)!;
    const variant = getVariant(product, g.variantId)!;
    return {
      slug: g.slug,
      variantId: g.variantId,
      colourId: g.colourId,
      pieces: g.pieces,
      unitWeightKg: variant.weightKg ?? null,
      ...productionFields(product, variant),
    };
  });
  return { sku: null, supplier: null, supplierCode: null, kitProduction: JSON.stringify(kit) };
}

/** Order item without the internal supplier columns — what public routes return. */
export function publicItem<T extends Record<string, unknown>>(item: T) {
  const { sku: _sku, supplier: _supplier, supplierCode: _code, kitProduction: _kit, ...rest } = item;
  return rest;
}

/** Loads an order the caller may access, or throws NOT_FOUND (never reveals that it exists). */
async function accessibleOrder(
  lookup: z.infer<typeof orderLookup>,
  user: Parameters<typeof canAccessOrder>[2],
) {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.reference, lookup.reference));
  if (!order || !canAccessOrder(order, lookup.token, user))
    throw new ORPCError("NOT_FOUND", { message: "Order not found" });
  return order;
}


export const orders = {
  /** Recalculate a cart without persisting it — used by the cart + checkout views. */
  quote: base
    .input(
      z.object({
        lines: z.array(cartLine).max(60),
        /** Delivery postcode; omitted = shipping shown as "enter your postcode". */
        postcode: z.string().max(10).optional().nullable(),
        /** Customer correction of the detected metro/regional zone. */
        zone: zoneInput.optional().nullable(),
      }),
    )
    .handler(({ input, context }) => {
      enforceLimit("quote", context.headers);
      const lines = input.lines.map(priceLine);
      const totals = orderTotals(lines, input.postcode, input.zone);
      return {
        lines,
        ...totals,
        itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
      };
    }),

  /** Which payment gateway is connected (eWAY), and which env names are missing. No secrets. */
  paymentStatus: base.handler(() => paymentStatusInfo()),

  create: withUser
    .input(
      z.object({
        customer: z.object({
          name: z.string().min(2).max(120),
          company: z.string().max(120).optional().nullable(),
          email: z.string().email(),
          phone: z.string().max(40).optional().nullable(),
          notes: z.string().max(1000).optional().nullable(),
        }),
        shipping: shippingAddressInput,
        lines: z.array(cartLine).min(1).max(60),
        /**
         * Random key the browser makes for one checkout attempt. Resubmitting the same attempt
         * (double click, retry after a network error, back button) returns the order already
         * created instead of a second one.
         */
        checkoutKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      enforceLimit("order-create", context.headers);
      const lines = input.lines.map(priceLine);
      if (input.checkoutKey) {
        const [existing] = await db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.checkoutKey, input.checkoutKey));
        // Same attempt only: same customer email and the same server-computed total.
        if (existing) {
          const again = orderTotals(lines, input.shipping.postcode, input.shipping.zone);
          if (
            existing.email.toLowerCase() === input.customer.email.toLowerCase() &&
            existing.total === again.total
          )
            return {
              ...publicOrder(existing),
              accessToken: existing.accessToken!,
              lines,
              shipping: again.shipping,
              reused: true as const,
            };
          throw new ORPCError("CONFLICT", {
            message: "Your cart changed while the order was being placed. Please review it and place the order again.",
          });
        }
      }
      // Shipping is recomputed here from the catalogue weights + postcode; no price the
      // browser shows is trusted. Over 30 kg (or no valid postcode) cannot be ordered.
      const totals = orderTotals(lines, input.shipping.postcode, input.shipping.zone);
      assertShippable(totals);
      const ship = totals.shipping;

      const [order] = await db
        .insert(schema.orders)
        .values({
          reference: randomReference("TF"),
          accessToken: newAccessToken(),
          userId: context.user?.id ?? null,
          customerName: input.customer.name,
          company: input.customer.company ?? null,
          email: input.customer.email,
          phone: input.customer.phone ?? null,
          notes: input.customer.notes ?? null,
          subtotal: totals.subtotal,
          embroideryFee: totals.embroideryFee,
          embroideredPieces: totals.embroideredPieces,
          shippingCharge: ship.charge,
          total: totals.total,
          shipAddress1: input.shipping.address1,
          shipAddress2: input.shipping.address2 || null,
          shipSuburb: input.shipping.suburb,
          shipState: input.shipping.state,
          shipPostcode: ship.postcode,
          shippingZone: ship.zone,
          shippingZoneDetected: ship.detectedZone,
          shippingZoneOverride: ship.zoneOverride,
          shippingWeightGrams: ship.grams,
          shippingBand: ship.band,
          shippingFlags: JSON.stringify(ship.flags),
          status: "awaiting_payment",
          paymentStatus: "unpaid",
          checkoutKey: input.checkoutKey ?? null,
        })
        .returning();

      await db.insert(schema.orderItems).values(
        lines.map((line) => ({
          orderId: order.id,
          kind: line.kind,
          productSlug: line.slug,
          productName: line.productName,
          variantId: line.variantId,
          variantName: line.variantName,
          material: line.material,
          unitWeightKg: line.unitWeightKg,
          ...internalFields(line),
          bundleId: line.bundleId,
          colourId: line.colourId,
          colourName: line.colourName,
          size: line.size,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          logoKey: line.logoKey,
          frontLogo: line.frontLogo,
          backLogo: line.backLogo,
          kitConfig: line.garments ? JSON.stringify({ version: 3, garments: line.garments }) : null,
          decorationMethod: line.decorationMethod,
          embroideredPieces: line.embroideredPieces,
          embroideryFee: line.embroideryFee,
        })),
      );

      // The access token goes back to this browser only — it is what lets the checkout
      // success page (and payment) load the order without an account.
      return { ...publicOrder(order), accessToken: order.accessToken!, lines, shipping: ship, reused: false as const };
    }),

  /**
   * Opens an eWAY Responsive Shared Page for an order (the card is entered on eWAY's page,
   * never here). Returns `configured: false` when the eWAY credentials are missing, and
   * `paid: true` when an earlier attempt for this order is already paid — never a second page.
   */
  startPayment: withUser
    .input(orderLookup)
    .handler(async ({ input, context }) => {
      enforceLimit("order-payment", context.headers);
      const order = await accessibleOrder(input, context.user);
      return startOrderPayment(order, context.headers);
    }),

  listMine: authed.handler(async ({ context }) => {
    const rows = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.userId, context.user.id))
      .orderBy(desc(schema.orders.id));
    return rows.map(publicOrder);
  }),

  get: withUser.input(orderLookup).handler(async ({ input, context }) => {
    enforceLimit("order-read", context.headers);
    const order = await accessibleOrder(input, context.user);
    const items = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.id));
    return { order: publicOrder(order), items: items.map(publicItem) };
  }),

  /**
   * Server-side verification after eWAY redirects back (or the customer cancels). Asks eWAY
   * about the order's AccessCodes; only an approved transaction for this order's exact total
   * and reference marks it paid. Never downgrades a paid order or overwrites staff status.
   */
  refreshPayment: withUser
    .input(
      orderLookup.extend({
        accessCode: z.string().max(512).optional().nullable(),
        cancelled: z.boolean().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      enforceLimit("order-payment-check", context.headers);
      const order = await accessibleOrder(input, context.user);
      const result = await verifyOrderPayment(order, input.accessCode, input.cancelled === true);
      return { ...publicOrder(result.order), outcome: result.outcome, outcomeMessage: result.message };
    }),
};
