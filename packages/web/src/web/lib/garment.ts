import type { GarmentColour, PlacementId, Product, SpotBox } from "../../shared/catalogue";
import {
  type PlacementSpot,
  SPOT_DEFS,
  defaultSpot,
  findSpot,
  offersBack,
  placeLogo,
  resolveLogo,
  spotsForView,
} from "../../shared/placements";
import type { LogoTransform } from "./cart";

export type GarmentView = "front" | "back";

export interface ResolvedView {
  image: string;
  /** "supplier" photo, or a "tint" rendered preview re-shaded from another colour's photo. */
  source: "supplier" | "tint";
}

/**
 * Resolves the photo for a colour + view. Returns null when no genuine photo exists
 * for that combination (e.g. the T-Shirt back) — the stage then draws a labelled
 * outline diagram instead of faking a photo.
 */
export function resolveView(colour: GarmentColour, view: GarmentView): ResolvedView | null {
  if (view === "front") return { image: colour.front, source: colour.source };
  if (colour.back) return { image: colour.back, source: colour.backSource ?? colour.source };
  return null;
}

export function hasView(colour: GarmentColour, view: GarmentView): boolean {
  return resolveView(colour, view) !== null;
}

/** Whether the garment takes a back logo (Standard Back), photo or not. */
export function backSupported(product: Product, _colour?: GarmentColour | null) {
  return offersBack(product);
}

function colourOf(product: Product, colour?: GarmentColour | null) {
  return colour ?? product.colours.find((c) => c.id === product.defaultColour) ?? product.colours[0];
}

/** Generic wearer's-left-chest box, used only when no product is known. */
const GENERIC: Record<GarmentView, SpotBox> = {
  front: { x: 62, y: 31, w: 14, h: 14 },
  back: { x: 50, y: 34, w: 30, h: 15 },
};

/**
 * The starting logo for a view: Left Chest (Front Panel on caps) or Standard Back,
 * from the product's fixed spots. Without a product, a generic left-chest box.
 */
export function defaultTransform(
  view: GarmentView,
  product?: Product | null,
  colour?: GarmentColour | null,
): LogoTransform {
  if (product) {
    const c = colourOf(product, colour);
    const spot = c ? defaultSpot(product, c, view) : null;
    if (spot && c) return placeLogo(product, c, spot);
  }
  const b = GENERIC[view];
  return { x: b.x, y: b.y, scale: b.w, height: b.h, rotation: 0, enabled: true };
}

/** A view with no logo. */
export const EMPTY_TRANSFORM: LogoTransform = { ...defaultTransform("front"), enabled: false };

export function spotLogo(product: Product, colour: GarmentColour, id: PlacementId): LogoTransform | null {
  const spot = findSpot(product, colour, id);
  return spot ? placeLogo(product, colour, spot) : null;
}

export function viewSpots(product: Product, colour: GarmentColour, view: GarmentView): PlacementSpot[] {
  return spotsForView(product, colour, view);
}

/**
 * Normalises a stored/legacy logo for this garment colour: re-fits a known spot,
 * maps an old free-positioned logo to the nearest spot (flagged `migrated`), or
 * turns it off when the spot doesn't exist on this garment.
 */
export function fitLogo(
  product: Product,
  colour: GarmentColour,
  view: GarmentView,
  t: LogoTransform | null | undefined,
): LogoTransform {
  const res = resolveLogo(product, colour, view, t, { allowLegacy: true });
  if (res.ok && res.logo) return res.logo;
  return { ...defaultTransform(view, product, colour), enabled: false };
}

/**
 * Preview box for a placed logo: the logo is scaled to fit inside the spot's
 * width × height (object-contain), never rotated.
 */
export function logoBoxStyle(t: LogoTransform) {
  const h = t.height ?? t.scale;
  return {
    left: `${t.x}%`,
    top: `${t.y}%`,
    width: `${t.scale}%`,
    height: `${h}%`,
    transform: "translate(-50%, -50%)",
    objectFit: "contain",
  } as const;
}

export function spotLabel(t: LogoTransform | null | undefined) {
  if (!t || !t.enabled) return null;
  const id = t.placementId ?? t.production?.spot;
  return id ? SPOT_DEFS[id].label : null;
}

/** "Left Chest · up to 9 × 9 cm" / "None". */
export function describePlacement(
  product: Product,
  colour: GarmentColour,
  view: GarmentView,
  t: LogoTransform | null | undefined,
) {
  if (!t || !t.enabled) return "None";
  const fitted = fitLogo(product, colour, view, t);
  if (!fitted.enabled || !fitted.placementId) return "None";
  const d = SPOT_DEFS[fitted.placementId];
  return `${d.label} · up to ${d.widthCm} × ${d.heightCm} cm`;
}

export type TransferResult =
  | { ok: true; transform: LogoTransform }
  | { ok: false; reason: string };

/**
 * Copies one garment's spot for a view onto another garment — by spot id only, so a
 * Left Chest lands on the target's own Left Chest. Skips (with a reason) when the
 * target doesn't offer that spot: no sleeves on sleeveless garments, caps only take
 * the Front Panel, and so on. Turning a view off copies as "off".
 */
export function transferPlacement(
  _src: { product: Product; colour: GarmentColour },
  dst: { product: Product; colour: GarmentColour },
  view: GarmentView,
  t: LogoTransform,
  dstCurrent: LogoTransform,
): TransferResult {
  if (view === "back" && !offersBack(dst.product)) return { ok: false, reason: "no back logo spot" };
  if (!t.enabled) return { ok: true, transform: { ...dstCurrent, enabled: false } };
  const id = t.placementId;
  if (!id) return { ok: false, reason: "no fixed spot chosen" };
  const next = spotLogo(dst.product, dst.colour, id);
  if (!next) {
    const label = SPOT_DEFS[id].label;
    if (dst.product.silhouette === "cap") return { ok: false, reason: "cap takes the Front Panel only" };
    if (id.endsWith("sleeve") && dst.product.silhouette === "sleeveless")
      return { ok: false, reason: `sleeveless — no ${label}` };
    return { ok: false, reason: `no ${label} spot` };
  }
  return { ok: true, transform: t.method ? { ...next, method: t.method } : next };
}
