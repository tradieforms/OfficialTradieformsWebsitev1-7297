/**
 * INTERNAL supplier data — server only. Never import this from src/web or src/shared:
 * supplier names, supplier costs and supplier codes must not reach the browser or any
 * public API response. Customer-facing product data lives in shared/catalogue.ts.
 *
 * Source of truth: the master update brief (product/SKU section) plus the owner's
 * confirmation for Jacket, Style 2 and the Crewneck Jacket (NH = no hood). SKUs are only recorded where they were supplied —
 * nothing here is inferred from a similar-looking product.
 */
import { getProduct, getVariant, products, type Product, type ProductVariant } from "../../shared/catalogue";

export interface SupplierRecord {
  /** Tradie Forms item code (the SKU forwarded to the supplier). null = not supplied yet. */
  sku: string | null;
  supplier?: string;
  /** Supplier's own product code (e.g. "HZ 7177"). */
  supplierCode?: string;
  /** Additional supplier style / reference code (e.g. "QP T027"). */
  styleRef?: string;
  /** Listed supplier cost, integer cents AUD. Internal only. */
  cost?: number;
  /** Open questions for the business. Empty = fully mapped. */
  issues: string[];
}

/** Keyed by `${productSlug}:${variantId}`. */
const RECORDS: Record<string, SupplierRecord> = {
  "work-polo:option-1": { sku: "TF-QDC-P-1-AM", supplier: "AMY", cost: 2748, issues: [] },
  "work-polo:option-2": {
    sku: "TF-EQDC-P-4-AM",
    supplier: "ELLA",
    styleRef: "TS-D659",
    cost: 1783,
    issues: [],
  },
  "work-polo:option-3": { sku: "TF-C-P-5-AM", supplier: "AMY", cost: 1983, issues: [] },
  "work-t-shirt:240gsm": {
    sku: "TF-C-TS-240-AM",
    supplier: "CHENGYU",
    styleRef: "QP T027",
    issues: ["Supplier cost not supplied."],
  },
  "work-t-shirt:260gsm": {
    sku: "TF-C-TS-260-AM",
    supplier: "CHENGYU",
    styleRef: "QP T018",
    // Only -AM SKUs are used (owner, session 16) — the inventory PDF's -EL code is ignored.
    issues: ["Supplier cost not supplied."],
  },
  "vest:premium": { sku: "TF-N-V-AM", supplier: "AMY", cost: 3350, issues: [] },
  "hoodie:style-1": { sku: "TF-C-H-AM", supplier: "AMY", supplierCode: "HX Y06", cost: 2657, issues: [] },
  // NH = "no hood" (confirmed by the owner): the Crewneck Jacket is the stand-collar
  // navy jacket (`jacket`); the hooded black jacket (`jacket-b`) is Jacket, Style 2.
  "jacket:standard": {
    sku: "TF-P-J-3-NH-AM",
    supplier: "AMY",
    supplierCode: "HZ8518",
    cost: 2405,
    issues: [],
  },
  "jacket-b:standard": {
    sku: "TF-P-J-2-AM",
    supplier: "AMY",
    supplierCode: "HZ 7177",
    cost: 3028,
    issues: [],
  },
  // TF-C-TT-AM confirmed by the owner for the singlet / tank top (session 16).
  "tank-top:standard": {
    sku: "TF-C-TT-AM",
    issues: ["Supplier, supplier cost and material not supplied (existing RRP A$37.99 retained)."],
  },
  "cap:standard": {
    sku: null,
    issues: [
      "SKU mapping required — no cap SKU supplied (inventory PDF has Trucker Hat TF-TH-IN and 5 Panel Hats TF-PH-IN; neither confirmed for this 6-panel cap).",
      "Supplier, cost, material, RRP and shipping weight not supplied (existing A$29.99 retained).",
      "No shipping weight: caps are excluded from the calculated shipment weight and the order is flagged for a shipping review.",
    ],
  },
};

/** Stored for future use — NOT on the storefront, in navigation or in bundles. */
export const STORED_PRODUCTS = [
  {
    name: "Quarterzip",
    material: "100% polyester",
    sku: "TF-QZ-P-AM",
    supplier: "AMY",
    styleRef: "TS 3817",
    cost: 2033,
    price: 5499,
    weightKg: 0.71,
    storefront: false,
    issues: ["Stored only — no product page, images or placements until requested."],
  },
  {
    // Removed from the storefront by the owner (session 16); Premium Vest, Style 2 stays.
    name: "Lightweight Vest, Style 1",
    material: "100% nylon fabric, polyester lining, polyester filling",
    sku: "TF-N-V-EL",
    supplier: "ELLA",
    styleRef: "",
    cost: 2109,
    price: 5495,
    weightKg: 0.75,
    storefront: false,
    issues: ["Stored only — removed from the storefront (not -AM); not selectable in the shop or bundles."],
  },
] as const;

const UNMAPPED: SupplierRecord = { sku: null, issues: ["SKU mapping required — no supplier record."] };

export function supplierRecord(slug: string, variantId: string): SupplierRecord {
  return RECORDS[`${slug}:${variantId}`] ?? UNMAPPED;
}

/** The internal fields stored on an order line (cost is never copied onto orders). */
export function productionFields(product: Product, variant: ProductVariant) {
  const r = supplierRecord(product.slug, variant.id);
  return {
    sku: r.sku,
    supplier: r.supplier ?? null,
    supplierCode: r.supplierCode ?? r.styleRef ?? null,
  };
}

export interface MappingRow {
  product: string;
  variant: string;
  slug: string;
  variantId: string;
  material: string;
  sku: string | null;
  supplier: string | null;
  supplierCode: string | null;
  price: number;
  weightKg: number | null;
  storefront: boolean;
  issues: string[];
}

/** Every storefront variant plus stored-only products, for the SKU mapping report. */
export function mappingRows(): MappingRow[] {
  const rows: MappingRow[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      const r = supplierRecord(p.slug, v.id);
      const issues = [...r.issues];
      if (v.weightKg == null && !issues.some((i) => i.includes("shipping weight")))
        issues.push("Shipping weight not supplied.");
      rows.push({
        product: p.name,
        variant: v.name,
        slug: p.slug,
        variantId: v.id,
        material: [v.material, v.fabricWeight].filter(Boolean).join(", ") || "—",
        sku: r.sku,
        supplier: r.supplier ?? null,
        supplierCode: [r.supplierCode, r.styleRef].filter(Boolean).join(" / ") || null,
        price: v.price,
        weightKg: v.weightKg ?? null,
        storefront: true,
        issues,
      });
    }
  }
  for (const s of STORED_PRODUCTS) {
    rows.push({
      product: s.name,
      variant: s.name,
      slug: "—",
      variantId: "—",
      material: s.material,
      sku: s.sku,
      supplier: s.supplier,
      supplierCode: s.styleRef || null,
      price: s.price,
      weightKg: s.weightKg,
      storefront: false,
      issues: [...s.issues],
    });
  }
  return rows;
}

/** Validates a slug + variant pair; used by the order and design routes. */
export function lookupVariant(slug: string, variantId?: string | null) {
  const product = getProduct(slug);
  if (!product) return null;
  const variant = getVariant(product, variantId);
  return variant ? { product, variant } : null;
}
