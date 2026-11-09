/**
 * Australia shipping calculator — the single implementation used by the cart, checkout,
 * the order API (which recomputes it and never trusts the browser), the order record,
 * the confirmation page and the supplier PDF.
 *
 * Charges are what TradieForms charges customers (brief §5), not carrier postage.
 * All weights are handled as integer GRAMS to avoid floating-point boundary errors
 * (e.g. 0.56 kg × 9 = 5.04 kg, never 5.0400000001).
 */

/* -------------------------------------------------------------------------- */
/* Configuration — edit here; nothing else needs rewriting                     */
/* -------------------------------------------------------------------------- */

export type ShippingZone = "metro" | "regional";

export interface ShippingBand {
  /** Inclusive upper bound in grams. A shipment of exactly 5000 g is in the ≤5 kg band. */
  upToGrams: number;
  /** Customer charge, integer cents inc. GST. */
  metro: number;
  regional: number;
}

/**
 * Supplied band schedule. Boundaries: lower bound EXCLUSIVE, upper bound INCLUSIVE
 * (>5 kg and ≤10 kg is the second band). To add the future >30 kg band, append a row —
 * MAX_WEIGHT_GRAMS follows the last row automatically.
 */
export const SHIPPING_BANDS: ShippingBand[] = [
  { upToGrams: 5_000, metro: 1600, regional: 3000 },
  { upToGrams: 10_000, metro: 3000, regional: 5000 },
  { upToGrams: 15_000, metro: 5000, regional: 7000 },
  { upToGrams: 20_000, metro: 7000, regional: 11000 },
  { upToGrams: 25_000, metro: 11000, regional: 15000 },
  { upToGrams: 30_000, metro: 15000, regional: 19000 },
];

/** Heaviest shipment with a supplied price. Above this a custom quote is required. */
export const MAX_WEIGHT_GRAMS = SHIPPING_BANDS[SHIPPING_BANDS.length - 1].upToGrams;

/**
 * Shipments under 1 kg: APPROVED minimum-band policy (buyer decision, session 16) —
 * they are charged the first (≤5 kg) band. Shown to the customer as a note.
 */
export const MIN_BAND_BELOW_GRAMS = 1_000;

/**
 * Packaging allowance added to the garment weight. NOT APPROVED — the brief forbids an
 * invented allowance, so this stays 0 until the business confirms a figure.
 */
export const PACKAGING_ALLOWANCE_GRAMS = 0;

/**
 * Items with no confirmed shipping weight (currently the Cap):
 *  - "flag":  excluded from the weight, the order is flagged for a shipping review and
 *             the customer is told caps may need a custom shipping quote (current policy);
 *  - "quote": checkout is blocked with "custom shipping quote required".
 */
export const UNWEIGHED_ITEM_POLICY: "flag" | "quote" = "flag";

/* -------------------------------------------------------------------------- */
/* Metro / regional classification                                             */
/* -------------------------------------------------------------------------- */

/**
 * "Metro" = the Capital City postcodes in Australia Post's MyPost Business Zone 1
 * coverage list. Every other valid Australian postcode is "regional" — including
 * Australia Post's "Major Areas" (Gold Coast, Geelong, Newcastle, Wollongong, Gosford…),
 * which are not capital cities (business decision, session 16).
 *
 * This is a STATIC copy, not a live API. Re-check it against the source periodically
 * (Australia Post revises the list). The customer can correct the classification at
 * checkout; a correction is flagged on the order and the production sheet.
 */
export const METRO_SOURCE = {
  name: "Australia Post — MyPost Business Zone 1 coverage, Capital Cities postcode list",
  url: "https://auspost.com.au/content/dam/auspost_corp/media/documents/mpb-zone-1-coverage.pdf",
  documentDate: "June 2022 (Zone 1 changes effective 4 July 2022)",
  copiedOn: "2026-10-25",
  note: "Static copy — verify periodically against the source.",
};

const CAPITAL_CITY_POSTCODES: Record<string, string> = {
  Canberra: "0200, 2582, 2600-2620, 2900-2906, 2911-2914",
  Sydney:
    "1100, 1215, 1220, 1225, 1230-1231, 1235, 1239-1240, 1291, 1300, 1335, 1340, 1350, 1355, 1360, 1405, 1435, 1445, 1450, 1455, 1460, 1465-1466, 1470, 1475, 1480-1481, 1485, 1490, 1495, 1499, 1515, 1560, 1565, 1570, 1585, 1590, 1595, 1602, 1630, 1635, 1640, 1655, 1660-1685, 1700, 1710-1730, 1750-1765, 1790, 1800-1811, 1825, 1835, 1851-1885, 1890-1891, 2000-2080, 2084-2156, 2158, 2160-2234, 2555-2559, 2563-2567, 2745-2752, 2759-2774, 2776-2777, 2890-2891",
  Melbourne:
    "3000-3097, 3101-3138, 3140-3207, 3335-3340, 3427-3429, 3750-3753, 3765, 3787, 3800-3810, 3930, 3975-3976, 8001-8012, 8045, 8051, 8066-8071, 8102, 8111-8205, 8438, 8511, 8785, 9999",
  Brisbane:
    "4000-4022, 4029-4037, 4051-4078, 4101-4133, 4151-4179, 4205, 4300-4304, 4500-4506, 4508-4511, 4520, 9000-9002, 9005-9007, 9009-9015, 9464",
  Adelaide:
    "5000-5025, 5031-5052, 5061-5076, 5081-5098, 5106-5127, 5131-5133, 5150, 5156, 5158-5170, 5173-5174, 5800, 5810, 5839, 5842, 5950",
  Perth:
    "6000-6038, 6050-6081, 6090, 6100-6112, 6147-6176, 6180-6182, 6209-6210, 6800, 6809, 6827-6831, 6837-6850, 6865, 6872, 6892, 6900-6939, 6941-6979, 6981-6997",
  Hobart: "7000-7019, 7025, 7030, 7050-7053, 7055, 7170, 7172",
  Darwin: "0800-0801, 0804, 0810-0814, 0820-0821, 0828-0831, 0851, 0861, 0871, 0906, 0907, 0909",
};

interface PostcodeRange {
  from: number;
  to: number;
  city: string;
}

export const METRO_RANGES: PostcodeRange[] = Object.entries(CAPITAL_CITY_POSTCODES).flatMap(
  ([city, list]) =>
    list.split(",").map((part) => {
      const [a, b] = part.trim().split("-");
      return { from: Number(a), to: Number(b ?? a), city };
    }),
);

/** Australian postcodes are four digits, 0200–9999 (NT codes start with 0). */
export function normalisePostcode(raw: string | null | undefined): string | null {
  const pc = (raw ?? "").replace(/\s+/g, "");
  if (!/^\d{4}$/.test(pc)) return null;
  const n = Number(pc);
  return n >= 200 ? pc : null;
}

export interface PostcodeClass {
  postcode: string;
  zone: ShippingZone;
  /** Capital city matched, or null when regional. */
  city: string | null;
}

export function classifyPostcode(raw: string | null | undefined): PostcodeClass | null {
  const pc = normalisePostcode(raw);
  if (!pc) return null;
  const n = Number(pc);
  const hit = METRO_RANGES.find((r) => n >= r.from && n <= r.to);
  return { postcode: pc, zone: hit ? "metro" : "regional", city: hit?.city ?? null };
}

/* -------------------------------------------------------------------------- */
/* Weight + charge                                                             */
/* -------------------------------------------------------------------------- */

export const kgToGrams = (kg: number) => Math.round(kg * 1000);

export const formatKg = (grams: number) =>
  `${(grams / 1000).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;

export interface WeightItem {
  name: string;
  quantity: number;
  /** Per-item weight; null/undefined = not confirmed. */
  weightKg?: number | null;
}

export interface ShipmentWeight {
  /** Sum of quantity × weight for weighed items (+ packaging allowance, currently 0). */
  grams: number;
  pieces: number;
  /** Pieces with no confirmed weight, grouped by name (e.g. { Cap: 10 }). */
  unweighed: Record<string, number>;
}

export function shipmentWeight(items: WeightItem[]): ShipmentWeight {
  let grams = 0;
  let pieces = 0;
  const unweighed: Record<string, number> = {};
  for (const item of items) {
    if (item.quantity <= 0) continue;
    pieces += item.quantity;
    if (typeof item.weightKg === "number" && item.weightKg > 0) {
      grams += kgToGrams(item.weightKg) * item.quantity;
    } else {
      unweighed[item.name] = (unweighed[item.name] ?? 0) + item.quantity;
    }
  }
  return { grams: pieces > 0 ? grams + PACKAGING_ALLOWANCE_GRAMS : 0, pieces, unweighed };
}

export function bandFor(grams: number): ShippingBand | null {
  return SHIPPING_BANDS.find((b) => grams <= b.upToGrams) ?? null;
}

export function bandLabel(band: ShippingBand): string {
  const i = SHIPPING_BANDS.indexOf(band);
  const lower = i > 0 ? SHIPPING_BANDS[i - 1].upToGrams / 1000 : 0;
  const upper = band.upToGrams / 1000;
  return i > 0 ? `over ${lower} kg up to ${upper} kg` : `up to ${upper} kg`;
}

export type ShippingStatus =
  /** Charge known. */
  | "ok"
  /** No (valid) postcode yet — the charge can't be shown. */
  | "needs_postcode"
  /** Over the supplied table (or unweighed items under the "quote" policy). */
  | "custom_quote"
  /** Nothing to ship. */
  | "empty";

export interface ShippingQuote {
  status: ShippingStatus;
  grams: number;
  pieces: number;
  unweighed: Record<string, number>;
  postcode: string | null;
  /** Zone used for the charge (the customer's correction when they made one). */
  zone: ShippingZone | null;
  /** Zone from the Australia Post list. */
  detectedZone: ShippingZone | null;
  city: string | null;
  /** True when the customer corrected the detected zone. */
  zoneOverride: boolean;
  band: string | null;
  /** Integer cents; null unless status is "ok". */
  charge: number | null;
  /** True when the < 1 kg minimum-band policy set the band. */
  minimumBand: boolean;
  /** Customer-readable notes and review flags (also stored on the order). */
  flags: string[];
  message: string | null;
}

export function quoteShipping(
  items: WeightItem[],
  postcodeRaw: string | null | undefined,
  zoneCorrection?: ShippingZone | null,
): ShippingQuote {
  const weight = shipmentWeight(items);
  const cls = classifyPostcode(postcodeRaw);
  const zone = cls ? (zoneCorrection ?? cls.zone) : null;
  const flags: string[] = [];
  const unweighedNames = Object.keys(weight.unweighed);
  const base: ShippingQuote = {
    status: "ok",
    grams: weight.grams,
    pieces: weight.pieces,
    unweighed: weight.unweighed,
    postcode: cls?.postcode ?? null,
    zone,
    detectedZone: cls?.zone ?? null,
    city: cls?.city ?? null,
    zoneOverride: Boolean(cls && zoneCorrection && zoneCorrection !== cls.zone),
    band: null,
    charge: null,
    minimumBand: false,
    flags,
    message: null,
  };

  if (weight.pieces === 0) return { ...base, status: "empty" };

  if (unweighedNames.length) {
    const list = unweighedNames.map((n) => `${weight.unweighed[n]}× ${n}`).join(", ");
    if (UNWEIGHED_ITEM_POLICY === "quote") {
      return {
        ...base,
        status: "custom_quote",
        message: `Custom shipping quote required: ${list} ha${unweighedNames.length > 1 ? "ve" : "s"} no confirmed shipping weight.`,
      };
    }
    flags.push(
      `Shipping weight not confirmed for ${list} — not included in the weight below; flagged for a shipping review (a custom shipping quote may apply).`,
    );
  }

  if (weight.grams > MAX_WEIGHT_GRAMS) {
    return {
      ...base,
      status: "custom_quote",
      message: `This order weighs ${formatKg(weight.grams)} — over the ${MAX_WEIGHT_GRAMS / 1000} kg limit of our shipping table. A custom shipping quote is required before checkout.`,
    };
  }

  const band = bandFor(weight.grams)!;
  const minimumBand = weight.grams < MIN_BAND_BELOW_GRAMS;
  if (minimumBand) flags.push("Under 1 kg — charged at the minimum (up to 5 kg) band.");
  if (base.zoneOverride)
    flags.push(
      `Customer corrected the delivery zone to ${zone} (Australia Post list says ${cls!.zone} for ${cls!.postcode}).`,
    );

  if (!cls || !zone) {
    return {
      ...base,
      status: "needs_postcode",
      band: bandLabel(band),
      minimumBand,
      message: postcodeRaw?.trim()
        ? "Enter a valid 4-digit Australian postcode to calculate shipping."
        : "Enter your delivery postcode to calculate shipping.",
    };
  }

  return { ...base, band: bandLabel(band), charge: band[zone], minimumBand };
}

export const zoneLabel = (z: ShippingZone | null | undefined) =>
  z === "metro" ? "Metro (capital city)" : z === "regional" ? "Regional" : "—";
