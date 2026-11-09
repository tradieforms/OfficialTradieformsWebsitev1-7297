/**
 * INTERNAL supplier production sheet (PDF) — server only.
 *
 * Built from the stored order + order items (SKU, supplier and supplier code are copied
 * onto each item when the order is placed). Supplier cost is never printed. The sheet is
 * only marked approved for production once the order's payment status is "paid".
 */
import { readFile } from "node:fs/promises";
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type * as schema from "../database/schema";
import { bundles, formatAUD, getProduct, getVariant, type GarmentColour, type Product } from "../../shared/catalogue";
import { BACK_DIAGRAM_BOX, type PlacedLogo } from "../../shared/placements";
import { EMBROIDERY_FEE, embroideryFee, garmentMethod, methodLabel, viewMethod } from "../../shared/decoration";
import { formatKg, zoneLabel, type ShippingZone } from "../../shared/shipping";
import { BUCKET, s3 } from "./s3";

type Order = typeof schema.orders.$inferSelect;
type Item = typeof schema.orderItems.$inferSelect;

interface KitProductionEntry {
  slug: string;
  variantId: string;
  colourId: string;
  pieces: number;
  unitWeightKg: number | null;
  sku: string | null;
  supplier: string | null;
  supplierCode: string | null;
}

interface KitConfigGarment {
  slug: string;
  name: string;
  variantId?: string;
  variantName?: string;
  material?: string;
  colourId: string;
  colourName: string;
  pieces: number;
  sizes: { size: string; quantity: number }[];
  frontLogo: PlacedLogo | null;
  backLogo: PlacedLogo | null;
  placementPending?: boolean;
}

/** One garment group on the sheet — a single-product line, or one garment of a kit. */
interface SheetGarment {
  heading: string;
  product: Product | undefined;
  colour: GarmentColour | undefined;
  variantName: string | null;
  material: string | null;
  colourName: string;
  sku: string | null;
  supplier: string | null;
  supplierCode: string | null;
  sizes: { size: string; quantity: number }[];
  pieces: number;
  unitWeightKg: number | null;
  front: PlacedLogo | null;
  back: PlacedLogo | null;
  placementPending: boolean;
  logoKey: string | null;
  /** Retail price lines, for the itemised summary. */
  priceNote: string | null;
  /** Embroidery fee for every piece in this group (A$16 × pieces when any view is embroidered). */
  embroideryFee: number;
}

/* ----------------------------- colours / layout ----------------------------- */

const NAVY = rgb(11 / 255, 42 / 255, 91 / 255);
const NAVY_DEEP = rgb(6 / 255, 21 / 255, 46 / 255);
const YELLOW = rgb(1, 199 / 255, 44 / 255);
const ORANGE = rgb(242 / 255, 107 / 255, 33 / 255);
const INK = rgb(0.1, 0.12, 0.16);
const STEEL = rgb(0.36, 0.4, 0.47);
const LINE = rgb(0.84, 0.86, 0.9);
const PAPER = rgb(0.965, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;

/** Standard PDF fonts only encode WinAnsi — map common symbols and drop the rest. */
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function pdfSafe(text: string): string {
  return text
    .replace(/[→⇒]/g, "->")
    .replace(/≈/g, "~")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\r/g, "")
    .split("")
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return ch === "\n" || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch);
    })
    .join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      // Hard-break very long tokens (keys, URLs).
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let n = rest.length;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

/* --------------------------------- assets ---------------------------------- */

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "" };
  } catch {
    return null;
  }
}

/**
 * Site asset roots: source public/ (dev) and the built dist/ (production), relative to
 * src/api/lib, plus dist/ next to the working directory for the bundled Node build
 * (Hostinger), where import.meta.url points at the bundle instead.
 */
const ASSET_ROOTS = [
  ...["../../../public", "../../../dist"].map((rel) => decodeURIComponent(new URL(rel, import.meta.url).pathname)),
  `${process.cwd()}/dist`,
];

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

type SharpFn = typeof import("sharp");
let sharpLoader: Promise<SharpFn | null> | null = null;
/** sharp is optional at runtime: without it photos are embedded at full size. */
function loadSharp() {
  sharpLoader ??= import("sharp").then((m) => (m.default ?? m) as SharpFn).catch(() => null);
  return sharpLoader;
}

/** Garment photos are multi-megabyte PNGs; a 900px JPEG on white keeps the sheet small enough to email. */
async function shrinkPhoto(data: { bytes: Uint8Array; type: string } | null) {
  if (!data) return null;
  const sharp = await loadSharp();
  if (!sharp) return data;
  try {
    const out = await sharp(data.bytes)
      .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { bytes: new Uint8Array(out), type: "image/jpeg" };
  } catch {
    return data;
  }
}

/**
 * A site image (garment photo, brand mark) by its public URL path. Read from disk first so the
 * sheet doesn't depend on the request origin behind a proxy; falls back to HTTP.
 */
async function siteAsset(origin: string, path: string) {
  const clean = path.split("?")[0] ?? "";
  if (clean.startsWith("/") && !clean.includes("..")) {
    const type = IMAGE_TYPES[clean.slice(clean.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";
    for (const root of ASSET_ROOTS) {
      try {
        return { bytes: new Uint8Array(await readFile(`${root}${clean}`)), type };
      } catch {
        // fall through to the next root / HTTP
      }
    }
  }
  return fetchBytes(`${origin}${clean}`);
}

async function embed(doc: PDFDocument, data: { bytes: Uint8Array; type: string } | null): Promise<PDFImage | null> {
  if (!data) return null;
  const b = data.bytes;
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return await doc.embedPng(b);
    if (b[0] === 0xff && b[1] === 0xd8) return await doc.embedJpg(b);
  } catch {
    return null;
  }
  return null;
}

interface LogoAsset {
  key: string;
  url: string | null;
  image: PDFImage | null;
  format: string;
}

async function loadLogo(doc: PDFDocument, key: string): Promise<LogoAsset> {
  let url: string | null = null;
  try {
    // 7 days is the longest an S3 presigned link can live.
    url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
      expiresIn: 60 * 60 * 24 * 7,
    });
  } catch {
    url = null;
  }
  const data = url ? await fetchBytes(url) : null;
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return { key, url, image: await embed(doc, data), format: ext.toUpperCase() || "file" };
}

/* --------------------------------- builder --------------------------------- */

function parseLogo(raw: string | null): PlacedLogo | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as PlacedLogo;
    return t?.enabled ? t : null;
  } catch {
    return null;
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** "M × 4, L × 6" breakdown for a product line's single size. */
function sheetGarments(items: Item[]): SheetGarment[] {
  const out: SheetGarment[] = [];
  for (const item of items) {
    if (item.kind === "product") {
      const product = getProduct(item.productSlug);
      const colour = product?.colours.find((c) => c.id === item.colourId);
      out.push({
        heading: item.productName,
        product,
        colour,
        variantName: item.variantName,
        material: item.material,
        colourName: item.colourName,
        sku: item.sku,
        supplier: item.supplier,
        supplierCode: item.supplierCode,
        sizes: [{ size: item.size, quantity: item.quantity }],
        pieces: item.quantity,
        unitWeightKg: item.unitWeightKg,
        front: parseLogo(item.frontLogo),
        back: parseLogo(item.backLogo),
        placementPending: false,
        logoKey: item.logoKey,
        priceNote:
          item.embroideryFee > 0
            ? `${formatAUD(item.unitPrice)} garment + ${formatAUD(EMBROIDERY_FEE)} embroidery = ${formatAUD(item.unitPrice + EMBROIDERY_FEE)} each · line ${formatAUD(item.lineTotal)}`
            : `${formatAUD(item.unitPrice)} each · line ${formatAUD(item.lineTotal)}`,
        embroideryFee: item.embroideryFee,
      });
      continue;
    }
    const config = parseJson<{ garments?: KitConfigGarment[] }>(item.kitConfig, {});
    const production = parseJson<KitProductionEntry[]>(item.kitProduction, []);
    for (const g of config.garments ?? []) {
      const product = getProduct(g.slug);
      const colour = product?.colours.find((c) => c.id === g.colourId);
      const variant = product ? getVariant(product, g.variantId) : undefined;
      const prod = production.find(
        (p) => p.slug === g.slug && p.colourId === g.colourId && (!g.variantId || p.variantId === g.variantId),
      );
      const multiplier = item.quantity;
      const tier = bundles.find((b) => b.id === item.bundleId);
      const kitLabel = tier ? tier.tier : "Kit";
      out.push({
        heading: kitLabel ? `${g.name} — ${kitLabel}` : g.name,
        product,
        colour,
        variantName: g.variantName ?? variant?.name ?? null,
        material: g.material ?? variant?.material ?? null,
        colourName: g.colourName,
        sku: prod?.sku ?? null,
        supplier: prod?.supplier ?? null,
        supplierCode: prod?.supplierCode ?? null,
        sizes: g.sizes.map((s) => ({ size: s.size, quantity: s.quantity * multiplier })),
        pieces: g.pieces * multiplier,
        unitWeightKg: prod?.unitWeightKg ?? variant?.weightKg ?? null,
        front: g.frontLogo?.enabled ? g.frontLogo : null,
        back: g.backLogo?.enabled ? g.backLogo : null,
        placementPending: Boolean(g.placementPending),
        logoKey: item.logoKey,
        priceNote: null,
        embroideryFee: item.logoKey
          ? embroideryFee(g.pieces * multiplier, g.frontLogo?.enabled ? g.frontLogo : null, g.backLogo?.enabled ? g.backLogo : null)
          : 0,
      });
    }
  }
  return out;
}

function sortSizes(product: Product | undefined, sizes: { size: string; quantity: number }[]) {
  const order = product?.sizes ?? [];
  const merged = new Map<string, number>();
  for (const s of sizes) merged.set(s.size, (merged.get(s.size) ?? 0) + s.quantity);
  return [...merged.entries()]
    .map(([size, quantity]) => ({ size, quantity }))
    .sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size));
}

class Sheet {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly reference: string,
  ) {}

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pageNo++;
    this.y = PAGE_H - M;
    if (this.pageNo > 1) {
      this.text(`TRADIEFORMS · Production sheet · ${this.reference} (continued)`, M, this.y, 8, STEEL, true);
      this.y -= 18;
    }
  }

  ensure(h: number) {
    if (this.y - h < M + 20) this.newPage();
  }

  text(t: string, x: number, y: number, size: number, color = INK, isBold = false) {
    this.page.drawText(pdfSafe(t), { x, y, size, font: isBold ? this.bold : this.font, color });
  }

  /** Wrapped paragraph at the cursor; returns its height. */
  para(t: string, x: number, width: number, size: number, color = INK, isBold = false, lead = 1.32) {
    const lines = wrap(t, isBold ? this.bold : this.font, size, width);
    for (const line of lines) {
      this.ensure(size * lead);
      this.text(line, x, this.y - size, size, color, isBold);
      this.y -= size * lead;
    }
  }

  rule(color = LINE) {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: PAGE_W - M, y: this.y }, thickness: 0.7, color });
  }

  footer(total: number) {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(pdfSafe(`TradieForms Pty Ltd · INTERNAL supplier production sheet · ${this.reference}`), {
        x: M,
        y: 22,
        size: 7.5,
        font: this.font,
        color: STEEL,
      });
      p.drawText(`Page ${i + 1} of ${total}`, { x: PAGE_W - M - 50, y: 22, size: 7.5, font: this.font, color: STEEL });
    });
  }
}

/** Draws a garment view with the logo inside its fixed spot box (all in % of a square stage). */
function drawPreview(
  sheet: Sheet,
  x: number,
  top: number,
  size: number,
  garment: PDFImage | null,
  logo: PDFImage | null,
  t: PlacedLogo | null,
  label: string,
  outline?: { box: { x: number; y: number; w: number; h: number } },
) {
  const { page } = sheet;
  const y = top - size;
  page.drawRectangle({ x, y, width: size, height: size, color: WHITE, borderColor: LINE, borderWidth: 0.7 });
  if (garment) {
    const scale = Math.min(size / garment.width, size / garment.height);
    const w = garment.width * scale;
    const h = garment.height * scale;
    page.drawImage(garment, { x: x + (size - w) / 2, y: y + (size - h) / 2, width: w, height: h });
  } else if (outline) {
    sheet.text("Back view outline (no photo yet)", x + 6, y + size - 12, 6.5, STEEL);
  }
  const box = t
    ? { x: t.x, y: t.y, w: t.scale, h: t.height ?? t.scale }
    : outline
      ? outline.box
      : null;
  if (box && t) {
    const bw = (box.w / 100) * size;
    const bh = (box.h / 100) * size;
    const bx = x + (box.x / 100) * size - bw / 2;
    const by = y + size - (box.y / 100) * size - bh / 2;
    if (logo) {
      const s = Math.min(bw / logo.width, bh / logo.height);
      const lw = logo.width * s;
      const lh = logo.height * s;
      page.drawImage(logo, { x: bx + (bw - lw) / 2, y: by + (bh - lh) / 2, width: lw, height: lh });
    }
    page.drawRectangle({
      x: bx,
      y: by,
      width: bw,
      height: bh,
      borderColor: ORANGE,
      borderWidth: 0.9,
      borderDashArray: [2.5, 2],
    });
  }
  sheet.text(label, x, y - 10, 7, STEEL, true);
}

export async function buildProductionPdf(order: Order, items: Item[], assetOrigin: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`TradieForms production sheet ${order.reference}`);
  doc.setAuthor("TradieForms Pty Ltd");
  doc.setSubject("Internal supplier production sheet");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sheet = new Sheet(doc, font, bold, order.reference);
  const garments = sheetGarments(items);
  const approved = order.paymentStatus === "paid";

  // Assets: brand mark, every garment photo and each logo, embedded once.
  const brand = await embed(doc, await siteAsset(assetOrigin, "/images/brand/tradieforms-logo-trim.png"));
  const photoCache = new Map<string, PDFImage | null>();
  const photo = async (path: string | undefined) => {
    if (!path) return null;
    if (!photoCache.has(path)) photoCache.set(path, await embed(doc, await shrinkPhoto(await siteAsset(assetOrigin, path))));
    return photoCache.get(path) ?? null;
  };
  const logos = new Map<string, LogoAsset>();
  for (const key of new Set(items.map((i) => i.logoKey).filter((k): k is string => Boolean(k)))) {
    logos.set(key, await loadLogo(doc, key));
  }

  /* ---------- Page 1 header ---------- */
  sheet.newPage();
  const { page } = sheet;
  page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: NAVY_DEEP });
  page.drawRectangle({ x: 0, y: PAGE_H - 96, width: PAGE_W, height: 4, color: YELLOW });
  if (brand) {
    const h = 38;
    const w = (brand.width / brand.height) * h;
    page.drawImage(brand, { x: M, y: PAGE_H - 66, width: w, height: h });
  } else {
    sheet.text("TRADIEFORMS", M, PAGE_H - 56, 22, YELLOW, true);
  }
  sheet.text("SUPPLIER PRODUCTION SHEET", PAGE_W - M - 200, PAGE_H - 44, 11, YELLOW, true);
  sheet.text(`Order ${order.reference}`, PAGE_W - M - 200, PAGE_H - 60, 10, WHITE, true);
  sheet.text(
    `Placed ${new Date(order.createdAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })} (Sydney)`,
    PAGE_W - M - 200,
    PAGE_H - 74,
    8,
    WHITE,
  );
  sheet.y = PAGE_H - 112;

  /* ---------- Status banner ---------- */
  const bannerH = 34;
  page.drawRectangle({ x: M, y: sheet.y - bannerH, width: PAGE_W - 2 * M, height: bannerH, color: approved ? NAVY : ORANGE });
  sheet.text(
    approved ? "APPROVED FOR PRODUCTION — payment verified" : "NOT APPROVED FOR PRODUCTION — DO NOT START",
    M + 12,
    sheet.y - 15,
    11,
    WHITE,
    true,
  );
  sheet.text(
    approved
      ? `Payment status: paid${order.paymentProvider ? ` (${order.paymentProvider})` : ""}.`
      : `Payment status: ${order.paymentStatus}. This sheet is for review only until payment is verified.`,
    M + 12,
    sheet.y - 27,
    8,
    WHITE,
  );
  sheet.y -= bannerH + 14;

  const unmapped = garments.filter((g) => !g.sku).length;
  if (unmapped) {
    sheet.para(
      `SKU mapping required for ${unmapped} garment ${unmapped === 1 ? "group" : "groups"} below — confirm the supplier item code with Tradie Forms before ordering stock.`,
      M,
      PAGE_W - 2 * M,
      9,
      ORANGE,
      true,
    );
    sheet.y -= 4;
  }

  /* ---------- Order + customer ---------- */
  const colW = (PAGE_W - 2 * M - 20) / 2;
  const startY = sheet.y;
  const kv = (x: number, rows: [string, string | null | undefined][]) => {
    let y = startY;
    for (const [k, v] of rows) {
      if (!v) continue;
      sheet.text(k.toUpperCase(), x, y - 8, 6.8, STEEL, true);
      const lines = wrap(v, font, 9.5, colW);
      lines.forEach((l, i) => sheet.text(l, x, y - 20 - i * 12, 9.5, INK));
      y -= 20 + lines.length * 12 + 2;
    }
    return y;
  };
  const totalPieces = garments.reduce((s, g) => s + g.pieces, 0);
  const knownWeight = garments.reduce((s, g) => s + (g.unitWeightKg ?? 0) * g.pieces, 0);
  const weightGaps = garments.filter((g) => g.unitWeightKg == null).length;
  const embroideredPieces = garments.filter((g) => g.embroideryFee > 0).reduce((s, g) => s + g.pieces, 0);
  const yL = kv(M, [
    ["Order number", order.reference],
    ["Order status", `${order.status.replace(/_/g, " ")} · payment ${order.paymentStatus}`],
    ["Total pieces", String(totalPieces)],
    [
      "Decoration",
      embroideredPieces
        ? `${embroideredPieces} of ${totalPieces} pieces embroidered · ${totalPieces - embroideredPieces} printed / plain`
        : "All printed / plain — no embroidery",
    ],
    [
      "Shipping weight",
      order.shippingWeightGrams != null
        ? `${formatKg(order.shippingWeightGrams)} (charged weight)${weightGaps ? ` + ${weightGaps} garment group(s) with no weight on file` : ""}`
        : `${knownWeight.toFixed(2)} kg${weightGaps ? ` + ${weightGaps} garment group(s) with no weight on file` : ""}`,
    ],
    ["Order total (inc. GST)", formatAUD(order.total)],
  ]);
  const yR = kv(M + colW + 20, [
    ["Customer", order.customerName],
    ["Company", order.company],
    ["Email", order.email],
    ["Phone", order.phone],
  ]);
  sheet.y = Math.min(yL, yR) - 6;

  /* ---------- Delivery & shipping ---------- */
  const flags = parseJson<string[]>(order.shippingFlags, []);
  const shipRows: [string, string][] = [
    [
      "Deliver to",
      [
        order.shipAddress1,
        order.shipAddress2,
        [order.shipSuburb, order.shipState, order.shipPostcode].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ") || "No delivery address on this order",
    ],
    [
      "Zone",
      order.shippingZone
        ? `${zoneLabel(order.shippingZone as ShippingZone)}${
            order.shippingZoneOverride
              ? ` — SET BY CUSTOMER (postcode list says ${order.shippingZoneDetected ?? "unknown"}); verify before dispatch`
              : " (Australia Post capital-city postcode list)"
          }`
        : "—",
    ],
    [
      "Weight · band",
      order.shippingWeightGrams != null ? `${formatKg(order.shippingWeightGrams)} · ${order.shippingBand ?? "—"}` : "—",
    ],
    ["Shipping charged", order.shippingCharge != null ? formatAUD(order.shippingCharge) : "Not calculated"],
  ];
  sheet.ensure(30 + shipRows.length * 14 + flags.length * 11);
  sheet.text("DELIVERY & SHIPPING", M, sheet.y - 10, 9, NAVY, true);
  sheet.y -= 18;
  for (const [k, v] of shipRows) {
    sheet.text(k.toUpperCase(), M, sheet.y - 7, 6.5, STEEL, true);
    const warn = k === "Zone" && order.shippingZoneOverride;
    const lines = wrap(v, warn ? bold : font, 8.5, PAGE_W - 2 * M - 95);
    lines.forEach((l, i) => sheet.text(l, M + 95, sheet.y - 7 - i * 10.5, 8.5, warn ? ORANGE : INK, warn));
    sheet.y -= Math.max(1, lines.length) * 10.5 + 3;
  }
  for (const f of flags) sheet.para(`! ${f}`, M, PAGE_W - 2 * M, 8, ORANGE, true);
  sheet.y -= 4;

  if (order.notes) {
    sheet.ensure(40);
    sheet.text("CUSTOMER NOTES", M + 10, sheet.y - 10, 6.8, STEEL, true);
    sheet.y -= 14;
    sheet.para(order.notes, M + 10, PAGE_W - 2 * M - 12, 9);
    sheet.y -= 6;
  }

  /* ---------- Itemised summary ---------- */
  sheet.ensure(60);
  sheet.y -= 6;
  sheet.text("ITEMISED SUMMARY", M, sheet.y - 10, 9, NAVY, true);
  sheet.y -= 18;
  const cols = [M, M + 150, M + 245, M + 330, M + 385, M + 440];
  const head = ["Garment / option", "SKU", "Supplier code", "Colour", "Pieces", "Weight"];
  sheet.page.drawRectangle({ x: M, y: sheet.y - 14, width: PAGE_W - 2 * M, height: 16, color: PAPER });
  head.forEach((h, i) => sheet.text(h, cols[i] + 3, sheet.y - 9.5, 7, STEEL, true));
  sheet.y -= 16;
  for (const g of garments) {
    const nameLines = wrap(g.heading, font, 8, cols[1] - cols[0] - 6);
    const h = (Math.max(1, nameLines.length) + (g.logoKey && garmentMethod(g.front, g.back) ? 1 : 0)) * 10 + 6;
    sheet.ensure(h);
    const method = g.logoKey ? garmentMethod(g.front, g.back) : null;
    if (method) nameLines.push(methodLabel(method).toUpperCase());
    nameLines.forEach((l, i) =>
      sheet.text(
        l,
        cols[0] + 3,
        sheet.y - 10 - i * 10,
        i === nameLines.length - 1 && method ? 7 : 8,
        i === nameLines.length - 1 && method ? (method === "print" ? STEEL : ORANGE) : INK,
        true,
      ),
    );
    sheet.text(g.sku ?? "SKU MAPPING REQUIRED", cols[1] + 3, sheet.y - 10, 8, g.sku ? INK : ORANGE, true);
    sheet.text([g.supplier, g.supplierCode].filter(Boolean).join(" · ") || "—", cols[2] + 3, sheet.y - 10, 7.5, INK);
    sheet.text(g.colourName, cols[3] + 3, sheet.y - 10, 8, INK);
    sheet.text(String(g.pieces), cols[4] + 3, sheet.y - 10, 8, INK, true);
    sheet.text(g.unitWeightKg != null ? `${(g.unitWeightKg * g.pieces).toFixed(2)} kg` : "n/a", cols[5] + 3, sheet.y - 10, 8, INK);
    sheet.y -= h;
    sheet.rule();
  }
  const priceLines = items.map((i) => {
    const fee = i.embroideryFee > 0 ? ` incl. embroidery ${i.embroideredPieces} × ${formatAUD(EMBROIDERY_FEE)} = ${formatAUD(i.embroideryFee)}` : "";
    return i.kind === "product"
      ? `${i.productName} · ${i.colourName} · ${i.size} × ${i.quantity} — ${formatAUD(i.unitPrice)}${
          i.embroideryFee > 0 ? ` + ${formatAUD(EMBROIDERY_FEE)} embroidery` : ""
        } each = ${formatAUD(i.lineTotal)}`
      : `${i.productName} × ${i.quantity} — ${formatAUD(i.lineTotal)}${fee}`;
  });
  sheet.y -= 8;
  sheet.text("RETAIL PRICING (CUSTOMER CHARGED, INC. GST)", M, sheet.y - 8, 6.8, STEEL, true);
  sheet.y -= 12;
  for (const l of priceLines) sheet.para(`• ${l}`, M, PAGE_W - 2 * M, 8, INK);
  sheet.para(
    `Garments ${formatAUD(order.subtotal)}  +  Embroidery ${formatAUD(order.embroideryFee)}${
      order.embroideredPieces ? ` (${order.embroideredPieces} × ${formatAUD(EMBROIDERY_FEE)})` : ""
    }  +  Shipping ${order.shippingCharge != null ? formatAUD(order.shippingCharge) : "n/a"}  =  Order total ${formatAUD(order.total)}`,
    M,
    PAGE_W - 2 * M,
    8.5,
    INK,
    true,
  );

  /* ---------- One block per garment group ---------- */
  for (const [index, g] of garments.entries()) {
    const previewSize = 132;
    const blockMin = previewSize + 70;
    sheet.ensure(blockMin);
    sheet.y -= 14;
    sheet.page.drawRectangle({ x: M, y: sheet.y - 22, width: PAGE_W - 2 * M, height: 22, color: NAVY });
    sheet.text(`${index + 1}. ${g.heading}`, M + 10, sheet.y - 15, 10.5, WHITE, true);
    sheet.text(g.sku ?? "SKU MAPPING REQUIRED", PAGE_W - M - 10 - bold.widthOfTextAtSize(pdfSafe(g.sku ?? "SKU MAPPING REQUIRED"), 10), sheet.y - 15, 10, g.sku ? YELLOW : ORANGE, true);
    sheet.y -= 30;

    const top = sheet.y;
    const logo = g.logoKey ? (logos.get(g.logoKey) ?? null) : null;
    const frontImg = await photo(g.colour?.front);
    const backPhoto = g.colour?.back;
    const backImg = await photo(backPhoto);
    const showBack = Boolean(g.back) || Boolean(backPhoto);
    drawPreview(sheet, M, top, previewSize, frontImg, logo?.image ?? null, g.front, "FRONT");
    if (showBack && g.product?.print.back) {
      drawPreview(
        sheet,
        M + previewSize + 10,
        top,
        previewSize,
        backImg,
        logo?.image ?? null,
        g.back,
        "BACK",
        backImg ? undefined : { box: BACK_DIAGRAM_BOX[g.product.silhouette === "sleeveless" ? "sleeveless" : "sleeved"] },
      );
    }

    // Details column.
    const dx = M + (showBack && g.product?.print.back ? 2 * previewSize + 22 : previewSize + 14);
    const dw = PAGE_W - M - dx;
    let dy = top;
    const detail = (k: string, v: string | null | undefined, color = INK) => {
      if (!v) return;
      sheet.text(k.toUpperCase(), dx, dy - 7, 6.5, STEEL, true);
      const lines = wrap(v, font, 8.5, dw);
      lines.forEach((l, i) => sheet.text(l, dx, dy - 18 - i * 10.5, 8.5, color));
      dy -= 18 + lines.length * 10.5 + 1;
    };
    detail("Product / option", [g.product?.name, g.variantName && g.variantName !== g.product?.name ? g.variantName : null].filter(Boolean).join(" — "));
    detail("Material", g.material);
    detail("Colour", `${g.colourName}${g.colour?.source === "tint" ? " (preview is a rendered colour — supply the true shade)" : ""}`);
    detail("Supplier · code", [g.supplier, g.supplierCode].filter(Boolean).join(" · ") || "Not on file");
    detail(
      "Size breakdown",
      `${sortSizes(g.product, g.sizes).map((s) => `${s.size} × ${s.quantity}`).join(",  ")}   (total ${g.pieces})`,
    );
    detail(
      "Weight",
      g.unitWeightKg != null ? `${g.unitWeightKg} kg each · ${(g.unitWeightKg * g.pieces).toFixed(2)} kg total` : "Not on file",
    );
    detail("Price", g.priceNote);
    sheet.y = Math.min(dy, top - previewSize - 16);

    // Placement + decoration.
    const spots: string[] = [];
    for (const [view, t] of [
      ["Front", g.front],
      ["Back", g.back],
    ] as const) {
      if (!t) continue;
      const p = t.production;
      const m = (viewMethod(t) ?? "print").toUpperCase();
      spots.push(
        p
          ? `${view} — ${m}: ${p.label} [${p.spot}] — ${p.widthCm} × ${p.heightCm} cm max. ${p.instructions}`
          : `${view} — ${m}: logo placed (no fixed spot recorded — confirm placement with Tradie Forms).`,
      );
    }
    sheet.ensure(30);
    sheet.text("LOGO PLACEMENT & DECORATION", M, sheet.y - 8, 6.8, STEEL, true);
    sheet.y -= 12;
    if (!g.logoKey) sheet.para("Plain garment — no logo.", M, PAGE_W - 2 * M, 8.5);
    else if (g.placementPending)
      sheet.para("Logo supplied but no placement saved for this garment — confirm with Tradie Forms before printing.", M, PAGE_W - 2 * M, 8.5, ORANGE, true);
    else if (!spots.length) sheet.para("No logo on this garment.", M, PAGE_W - 2 * M, 8.5);
    for (const s of spots) sheet.para(`• ${s}`, M, PAGE_W - 2 * M, 8.5);
    if (g.logoKey) {
      const m = garmentMethod(g.front, g.back);
      if (g.embroideryFee > 0)
        sheet.para(
          `Embroidery fee: ${g.pieces} × ${formatAUD(EMBROIDERY_FEE)} = ${formatAUD(g.embroideryFee)} (charged once per garment${
            m === "embroidery" && g.front && g.back ? ", front and back both embroidered" : ""
          }).`,
          M,
          PAGE_W - 2 * M,
          8.5,
          ORANGE,
          true,
        );
      sheet.para(
        m === "embroidery"
          ? "Decoration: EMBROIDERY on every logo view above. Digitise from the original artwork; match the logo colours as closely as thread allows and confirm any fine detail with Tradie Forms."
          : m === "mixed"
            ? "Decoration: MIXED — follow the method shown on each view above (print one view, embroider the other). Print exactly as supplied with no added background box; digitise the embroidered view from the original artwork."
            : "Decoration: PRINT. Print the logo exactly as supplied — keep transparent areas transparent; no added background box.",
        M,
        PAGE_W - 2 * M,
        8,
        STEEL,
      );
    }
    sheet.y -= 4;
    sheet.rule();
  }

  /* ---------- Artwork ---------- */
  if (logos.size) {
    sheet.ensure(150);
    sheet.y -= 16;
    sheet.text("LOGO ARTWORK (ORIGINAL FILES)", M, sheet.y - 10, 9, NAVY, true);
    sheet.y -= 20;
    for (const asset of logos.values()) {
      sheet.ensure(130);
      const top = sheet.y;
      const box = 100;
      sheet.page.drawRectangle({ x: M, y: top - box, width: box, height: box, color: PAPER, borderColor: LINE, borderWidth: 0.7 });
      if (asset.image) {
        const s = Math.min((box - 10) / asset.image.width, (box - 10) / asset.image.height);
        const w = asset.image.width * s;
        const h = asset.image.height * s;
        sheet.page.drawImage(asset.image, { x: M + (box - w) / 2, y: top - box + (box - h) / 2, width: w, height: h });
      } else {
        sheet.text(`${asset.format} file`, M + 8, top - box / 2, 8, STEEL, true);
      }
      const save = sheet.y;
      sheet.y = top;
      const tx = M + box + 12;
      const tw = PAGE_W - M - tx;
      sheet.para(`File: ${asset.key.split("/").pop()}`, tx, tw, 8.5, INK, true);
      sheet.para(`Storage key: ${asset.key}`, tx, tw, 7.5, STEEL);
      sheet.para(
        asset.image
          ? "Preview above is the original upload. Use the original file (link below) for production, not this PDF."
          : "This format can't be previewed in a PDF — download the original file from the link below.",
        tx,
        tw,
        7.5,
        STEEL,
      );
      if (asset.url) {
        sheet.para("Download original (secure link, valid 7 days from when this sheet was generated):", tx, tw, 7.5, INK, true);
        sheet.para(asset.url, tx, tw, 6, NAVY);
      } else {
        sheet.para("Original file link unavailable — request the artwork from Tradie Forms.", tx, tw, 7.5, ORANGE, true);
      }
      sheet.y = Math.min(sheet.y, save - box) - 14;
    }
  }

  sheet.ensure(30);
  sheet.y -= 10;
  sheet.para(
    `Generated ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} (Sydney). Structured design data (product, option, colour, sizes, fixed spot ids, production sizes) is stored with the order; this sheet is a copy for the supplier.`,
    M,
    PAGE_W - 2 * M,
    7,
    STEEL,
  );

  sheet.footer(doc.getPageCount());
  return doc.save();
}
