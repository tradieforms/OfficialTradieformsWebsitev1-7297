import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export * from "./auth-schema";

/** A saved garment configuration. Stores editable config, never a screenshot. */
export const designs = sqliteTable("designs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  productSlug: text("product_slug").notNull(),
  /** Product variant (fabric/style option). null = saved before variants existed → default. */
  variantId: text("variant_id"),
  colourId: text("colour_id").notNull(),
  size: text("size").notNull(),
  /** Object key of the uploaded logo in storage (null = no logo yet). */
  logoKey: text("logo_key"),
  /** Original file name of the uploaded logo, for display when restoring. */
  logoName: text("logo_name"),
  /** View the design was last edited on ("front" | "back"). */
  activeView: text("active_view"),
  /** JSON transform per view: { x, y, scale, rotation, enabled } in stage %. */
  frontLogo: text("front_logo"),
  backLogo: text("back_logo"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull().unique(),
  userId: text("user_id"),
  customerName: text("customer_name").notNull(),
  company: text("company"),
  email: text("email").notNull(),
  phone: text("phone"),
  notes: text("notes"),
  /**
   * Integer cents, all recalculated server side from the catalogue:
   * subtotal = garments (after any bundle rate), embroideryFee = A$16 × embroidered
   * garments, shippingCharge = band charge; total = subtotal + embroideryFee + shippingCharge.
   */
  subtotal: integer("subtotal").notNull(),
  embroideryFee: integer("embroidery_fee").notNull().default(0),
  embroideredPieces: integer("embroidered_pieces").notNull().default(0),
  shippingCharge: integer("shipping_charge"),
  total: integer("total").notNull(),
  /** Delivery address (Australia only). */
  shipAddress1: text("ship_address1"),
  shipAddress2: text("ship_address2"),
  shipSuburb: text("ship_suburb"),
  shipState: text("ship_state"),
  shipPostcode: text("ship_postcode"),
  /** Zone charged ("metro" | "regional") and the zone the Australia Post list gave. */
  shippingZone: text("shipping_zone"),
  shippingZoneDetected: text("shipping_zone_detected"),
  /** True when the customer corrected the detected zone at checkout (flagged for review). */
  shippingZoneOverride: integer("shipping_zone_override", { mode: "boolean" }).notNull().default(false),
  /** Combined shipment weight in grams (quantity × per-item weight). */
  shippingWeightGrams: integer("shipping_weight_grams"),
  shippingBand: text("shipping_band"),
  /** JSON string[] — shipping notes / review flags (unweighed items, minimum band, override). */
  shippingFlags: text("shipping_flags"),
  status: text("status").notNull().default("awaiting_payment"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paymentProvider: text("payment_provider"),
  /** Latest payment-provider handle (eWAY AccessCode). Never returned to the browser. */
  paymentRef: text("payment_ref"),
  /** JSON string[] — every eWAY AccessCode issued for this order (re-checked before a retry). */
  paymentAttempts: text("payment_attempts"),
  /** eWAY TransactionID of the verified payment. */
  paymentTransactionId: text("payment_transaction_id"),
  /** Last verified result in words, e.g. "Approved (A2000)" or "Declined (D4405)". */
  paymentResult: text("payment_result"),
  /** Browser-generated key for one checkout attempt — a resubmit returns the same order. */
  checkoutKey: text("checkout_key").unique(),
  /** Secret (32 random bytes) that lets the browser that placed the order view / pay it. */
  accessToken: text("access_token"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull(),
  kind: text("kind").notNull().default("product"),
  productSlug: text("product_slug").notNull(),
  productName: text("product_name").notNull(),
  /** Product variant chosen by the customer (single-product lines). */
  variantId: text("variant_id"),
  variantName: text("variant_name"),
  material: text("material"),
  /** Shipping weight per item (kg), from the catalogue at order time. */
  unitWeightKg: real("unit_weight_kg"),
  /** INTERNAL — never returned by public routes. Tradie Forms item code sent to the supplier. */
  sku: text("sku"),
  /** INTERNAL — supplier name and supplier product code. */
  supplier: text("supplier"),
  supplierCode: text("supplier_code"),
  /**
   * INTERNAL — bundle kits: JSON [{ slug, variantId, colourId, sku, supplier, supplierCode,
   * unitWeightKg, pieces }] — one per garment group, for the supplier production PDF.
   */
  kitProduction: text("kit_production"),
  bundleId: text("bundle_id"),
  colourId: text("colour_id").notNull(),
  colourName: text("colour_name").notNull(),
  size: text("size").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  lineTotal: integer("line_total").notNull(),
  logoKey: text("logo_key"),
  frontLogo: text("front_logo"),
  backLogo: text("back_logo"),
  /**
   * Bundle kits: JSON { version, garments: [{ slug, name, colourId, colourName,
   * hasBack, pieces, sizes: [{ size, quantity }], frontLogo, backLogo,
   * placementPending }] } — each garment's own editable placement.
   */
  kitConfig: text("kit_config"),
  /** "print" | "embroidery" | "mixed" | null (no logo). Per view methods live in front/backLogo. */
  decorationMethod: text("decoration_method"),
  /** Physical garments on this line that carry the embroidery fee (× line quantity). */
  embroideredPieces: integer("embroidered_pieces").notNull().default(0),
  /** Embroidery fee for the whole line, integer cents (included in lineTotal). */
  embroideryFee: integer("embroidery_fee").notNull().default(0),
});

export const contactMessages = sqliteTable("contact_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  phone: text("phone"),
  message: text("message").notNull(),
  /** "sent" once the email provider accepted the notification, otherwise "failed". */
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  deliveryError: text("delivery_error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Orders over the 30 kg shipping limit can't check out at a fixed rate; the customer
 * requests a shipping quote instead. The cart is priced on the server and kept here so
 * staff can quote the freight and rebuild the order.
 */
export const shippingQuoteRequests = sqliteTable("shipping_quote_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reference: text("reference").notNull().unique(),
  userId: text("user_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  address1: text("address1"),
  suburb: text("suburb").notNull(),
  state: text("state").notNull(),
  postcode: text("postcode").notNull(),
  /** Zone used ("metro" | "regional"), what the postcode list said, and whether the customer changed it. */
  zone: text("zone"),
  zoneDetected: text("zone_detected"),
  zoneOverride: integer("zone_override", { mode: "boolean" }).notNull().default(false),
  weightGrams: integer("weight_grams").notNull(),
  pieces: integer("pieces").notNull(),
  /** Garments (after bundle rates) and embroidery, integer cents. Shipping is what staff quote. */
  subtotal: integer("subtotal").notNull(),
  embroideryFee: integer("embroidery_fee").notNull().default(0),
  /** JSON: server-priced summary [{ productName, colourName, size, quantity, lineTotal, ... }]. */
  linesSummary: text("lines_summary").notNull(),
  /** JSON: the cart lines exactly as submitted, so the order can be rebuilt. */
  cartLines: text("cart_lines").notNull(),
  /** JSON string[]: shipping notes (e.g. unweighed items). */
  shippingFlags: text("shipping_flags"),
  notes: text("notes"),
  /** "new" until staff reply with a quote. */
  status: text("status").notNull().default("new"),
  /** "sent" | "failed" | "not_configured" — email notification to the business inbox. */
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  deliveryError: text("delivery_error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const subscribers = sqliteTable("subscribers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  company: text("company"),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  deliveryError: text("delivery_error"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
