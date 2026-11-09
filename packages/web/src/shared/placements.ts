/**
 * Fixed logo placements — the only way a logo can be positioned.
 *
 * Every product offers a set of approved spots (Product.placements). Each spot has:
 *  - a view (front / back),
 *  - an on-screen box on that garment photo (centre + size, % of the square stage),
 *  - a production size in cm and written instructions for the print/embroidery team.
 *
 * Rules (shared by the browser and the API, so the server can re-derive everything):
 *  - one front spot and one back spot per garment, at most;
 *  - sleeves are front-view spots, so a sleeve logo replaces a chest logo;
 *  - "left"/"right" are the WEARER's — the wearer's left shows on the viewer's right;
 *  - garment colours without a back photo still offer the Standard Back, drawn on a
 *    labelled outline diagram (never a mirrored or reused front photo).
 *
 * Production sizes below are TradieForms defaults pending confirmation.
 */
import type { GarmentColour, PlacementId, PrintMap, Product, SpotBox } from "./catalogue";
import type { DecorationMethod } from "./decoration";

export type PlacementView = "front" | "back";

export interface PlacementSpotDef {
  id: PlacementId;
  label: string;
  view: PlacementView;
  recommended: boolean;
  /** Maximum logo area. The logo is scaled to fit inside it, keeping its proportions. */
  widthCm: number;
  heightCm: number;
  /** Customer-facing one-liner under the tile. */
  hint: string;
  /** Production wording (size is appended). */
  instructions: string;
}

export const SPOT_DEFS: Record<PlacementId, PlacementSpotDef> = {
  "left-chest": {
    id: "left-chest",
    label: "Left Chest",
    view: "front",
    recommended: true,
    widthCm: 9,
    heightCm: 9,
    hint: "Wearer's left · the classic spot",
    instructions:
      "Wearer's left chest (viewer's right when facing the garment), standard left-chest position.",
  },
  "right-chest": {
    id: "right-chest",
    label: "Right Chest",
    view: "front",
    recommended: false,
    widthCm: 9,
    heightCm: 9,
    hint: "Wearer's right",
    instructions:
      "Wearer's right chest (viewer's left when facing the garment), standard chest position mirrored.",
  },
  "left-sleeve": {
    id: "left-sleeve",
    label: "Left Sleeve",
    view: "front",
    recommended: false,
    widthCm: 7,
    heightCm: 7,
    hint: "Wearer's left upper arm",
    instructions: "Wearer's left sleeve, outer upper arm, centred below the shoulder seam.",
  },
  "right-sleeve": {
    id: "right-sleeve",
    label: "Right Sleeve",
    view: "front",
    recommended: false,
    widthCm: 7,
    heightCm: 7,
    hint: "Wearer's right upper arm",
    instructions: "Wearer's right sleeve, outer upper arm, centred below the shoulder seam.",
  },
  "standard-back": {
    id: "standard-back",
    label: "Standard Back",
    view: "back",
    recommended: true,
    widthCm: 30,
    heightCm: 15,
    hint: "Wide, across the upper back",
    instructions: "Upper back, centred left-to-right, landscape area below the collar line.",
  },
  "front-panel": {
    id: "front-panel",
    label: "Front Panel",
    view: "front",
    recommended: true,
    widthCm: 10,
    heightCm: 6,
    hint: "Centred above the brim",
    instructions: "Cap front panel, centred above the brim.",
  },
};

/** Product-specific production notes added to a spot's instructions. */
const PRODUCT_NOTES: Partial<Record<string, Partial<Record<PlacementId, string>>>> = {
  hoodie: { "standard-back": "Sits below where the hood falls." },
  "jacket-b": { "standard-back": "Sits below the hood seam." },
  vest: { "standard-back": "Vest back panel is narrower — keep within the panel seams." },
};

/**
 * Standard Back box on the outline diagram shown while a colour has no back photo.
 * Matches the diagram drawn by the web GarmentStage (see BackDiagram).
 */
export const BACK_DIAGRAM_BOX: Record<"sleeved" | "sleeveless", SpotBox> = {
  sleeved: { x: 50, y: 33, w: 32, h: 16 },
  sleeveless: { x: 50, y: 36, w: 28, h: 14 },
};

export interface PlacementSpot extends PlacementSpotDef {
  box: SpotBox;
  /** False when the spot is on the back and this colour has no back photo yet. */
  onPhoto: boolean;
}

/** Everything production needs, stored with every design, cart line and order. */
export interface ProductionSpec {
  spot: PlacementId;
  label: string;
  view: PlacementView;
  widthCm: number;
  heightCm: number;
  instructions: string;
}

/**
 * A logo placed on one view of one garment. `placementId` and `production` are the
 * source of truth; x/y/scale/height are the on-screen box (centre, width, height in %
 * of the stage) kept for previews.
 */
export interface PlacedLogo {
  placementId?: PlacementId;
  production?: ProductionSpec;
  x: number;
  y: number;
  scale: number;
  height?: number;
  rotation: number;
  enabled: boolean;
  /** Set when an older free-positioned logo was moved to the nearest fixed spot. */
  migrated?: boolean;
  /** Decoration method for this view; omitted = print (see shared/decoration.ts). */
  method?: DecorationMethod;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function frontMap(product: Product, colour: GarmentColour): PrintMap {
  return colour.printFront ?? product.print.front;
}

function defaultBox(id: PlacementId, map: PrintMap): SpotBox | null {
  const size = map.scale;
  switch (id) {
    case "left-chest":
      return { x: map.centre + map.chestOffset, y: map.chestY, w: size, h: size };
    case "right-chest":
      return { x: map.centre - map.chestOffset, y: map.chestY, w: size, h: size };
    case "front-panel":
      return { x: map.centre, y: map.chestY, w: size, h: r1(size * 0.6) };
    case "standard-back": {
      const w = Math.round(map.halfWidth * 1.3);
      return { x: map.centre, y: map.chestY + 2, w, h: r1(w / 2) };
    }
    default:
      return null; // sleeves are never guessed — they need an explicit box
  }
}

export function hasBackPhoto(colour: GarmentColour) {
  return Boolean(colour.back);
}

/** The approved spots for a garment colour, in display order, with this photo's geometry. */
export function productSpots(product: Product, colour: GarmentColour): PlacementSpot[] {
  const list: PlacementSpot[] = [];
  for (const id of product.placements) {
    const def = SPOT_DEFS[id];
    let box: SpotBox | null | undefined;
    let onPhoto = true;
    if (def.view === "front") {
      const map = frontMap(product, colour);
      box = colour.spots?.[id] ?? map.spots?.[id] ?? defaultBox(id, map);
    } else if (hasBackPhoto(colour) && product.print.back) {
      box = product.print.back.spots?.[id] ?? defaultBox(id, product.print.back);
    } else if (product.silhouette !== "cap") {
      box = BACK_DIAGRAM_BOX[product.silhouette];
      onPhoto = false;
    }
    if (box) list.push({ ...def, box, onPhoto });
  }
  return list;
}

export function findSpot(product: Product, colour: GarmentColour, id: string | null | undefined) {
  return productSpots(product, colour).find((s) => s.id === id) ?? null;
}

export function spotsForView(product: Product, colour: GarmentColour, view: PlacementView) {
  return productSpots(product, colour).filter((s) => s.view === view);
}

/** Whether the product offers a back logo at all (with or without a back photo yet). */
export function offersBack(product: Product) {
  return product.placements.includes("standard-back");
}

export function productionSpec(product: Product, spot: PlacementSpotDef): ProductionSpec {
  const note = PRODUCT_NOTES[product.slug]?.[spot.id];
  return {
    spot: spot.id,
    label: spot.label,
    view: spot.view,
    widthCm: spot.widthCm,
    heightCm: spot.heightCm,
    instructions: `${spot.label} — ${spot.instructions}${note ? ` ${note}` : ""} Scale the logo to fit within ${spot.widthCm} × ${spot.heightCm} cm, keeping its proportions; no rotation.`,
  };
}

/** The canonical placed logo for a spot on a garment colour. */
export function placeLogo(product: Product, _colour: GarmentColour, spot: PlacementSpot): PlacedLogo {
  return {
    placementId: spot.id,
    production: productionSpec(product, spot),
    x: spot.box.x,
    y: spot.box.y,
    scale: spot.box.w,
    height: spot.box.h,
    rotation: 0,
    enabled: true,
  };
}

/** The default spot for a view: Left Chest (or the cap Front Panel) / Standard Back. */
export function defaultSpot(product: Product, colour: GarmentColour, view: PlacementView) {
  const spots = spotsForView(product, colour, view);
  return spots.find((s) => s.recommended) ?? spots[0] ?? null;
}

/** Nearest approved spot (by box centre) to an old free-positioned logo. */
export function nearestSpot(
  product: Product,
  colour: GarmentColour,
  view: PlacementView,
  t: { x: number; y: number; scale: number; rotation?: number },
) {
  let best: PlacementSpot | null = null;
  let dist = Infinity;
  for (const s of spotsForView(product, colour, view)) {
    const d = Math.hypot(s.box.x - t.x, s.box.y - t.y);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  if (!best) return null;
  return { spot: best, distance: dist };
}

export type ResolveResult =
  | { ok: true; logo: PlacedLogo | null }
  | { ok: false; reason: string };

/**
 * Turns whatever was stored or sent for one view into the canonical placed logo:
 *  - disabled / missing → null (no logo on this view);
 *  - a known placementId → rebuilt from the catalogue for this colour (so the client
 *    can't smuggle in its own size or position, and colour changes re-fit the box);
 *  - an unknown or wrong-view placementId → error;
 *  - a legacy free transform (no placementId) → nearest spot, `migrated` flagged unless
 *    it was effectively already that spot (only when allowLegacy).
 */
export function resolveLogo(
  product: Product,
  colour: GarmentColour,
  view: PlacementView,
  raw: Partial<PlacedLogo> | null | undefined,
  opts: { allowLegacy?: boolean } = {},
): ResolveResult {
  if (!raw || raw.enabled === false) return { ok: true, logo: null };
  if (raw.placementId) {
    const spot = findSpot(product, colour, raw.placementId);
    if (!spot) return { ok: false, reason: `${product.name} doesn't offer a ${raw.placementId} logo spot` };
    if (spot.view !== view) return { ok: false, reason: `${spot.label} is not a ${view} spot` };
    return {
      ok: true,
      logo: {
        ...placeLogo(product, colour, spot),
        ...(raw.migrated ? { migrated: true } : {}),
        method: raw.method === "embroidery" ? "embroidery" : "print",
      },
    };
  }
  if (!opts.allowLegacy) return { ok: false, reason: "Choose one of the fixed logo spots" };
  if (typeof raw.x !== "number" || typeof raw.y !== "number" || typeof raw.scale !== "number") {
    return { ok: true, logo: null };
  }
  const near = nearestSpot(product, colour, view, {
    x: raw.x,
    y: raw.y,
    scale: raw.scale,
    rotation: raw.rotation,
  });
  if (!near) return { ok: true, logo: null };
  return {
    ok: true,
    // Every legacy free-positioned logo is flagged, even when it was already close to the spot.
    logo: {
      ...placeLogo(product, colour, near.spot),
      migrated: true,
      method: raw.method === "embroidery" ? "embroidery" : "print",
    },
  };
}
