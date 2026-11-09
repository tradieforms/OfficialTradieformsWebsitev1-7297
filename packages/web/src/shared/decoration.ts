/**
 * Printing vs embroidery — one rule shared by the studio, bundle builder, cart,
 * checkout, the order API and the supplier PDF.
 *
 *  - Each logo view (front / back) carries its own method; no method = print.
 *  - Embroidery adds EMBROIDERY_FEE per physical garment, charged ONCE per garment
 *    whether the front, the back or both views are embroidered.
 *  - The fee is quantity-aware: 10 embroidered garments = 10 × the fee.
 *  - Printed garments (and garments with no logo) never carry the fee.
 *
 * The fee is always derived from the stored methods, never accumulated, so editing
 * a design or revisiting checkout can't add it twice.
 */
import type { PlacedLogo } from "./placements";

export const DECORATION_METHODS = ["print", "embroidery"] as const;
export type DecorationMethod = (typeof DECORATION_METHODS)[number];

/** A$16 per embroidered garment, integer cents inc. GST (brief §4). */
export const EMBROIDERY_FEE = 1600;

type MaybeLogo = Pick<PlacedLogo, "enabled" | "method"> | null | undefined;

/** Method used on one view, or null when that view has no logo. */
export function viewMethod(logo: MaybeLogo): DecorationMethod | null {
  if (!logo || logo.enabled === false) return null;
  return logo.method === "embroidery" ? "embroidery" : "print";
}

/** True when at least one view of the garment is embroidered. */
export function isEmbroidered(front: MaybeLogo, back: MaybeLogo): boolean {
  return viewMethod(front) === "embroidery" || viewMethod(back) === "embroidery";
}

/** Embroidery fee for `pieces` identical garments (0 when nothing is embroidered). */
export function embroideryFee(pieces: number, front: MaybeLogo, back: MaybeLogo): number {
  return isEmbroidered(front, back) ? EMBROIDERY_FEE * Math.max(0, pieces) : 0;
}

/** Garment-level summary: "print", "embroidery", "mixed" (one of each) or null (no logo). */
export function garmentMethod(front: MaybeLogo, back: MaybeLogo): DecorationMethod | "mixed" | null {
  const f = viewMethod(front);
  const b = viewMethod(back);
  if (!f && !b) return null;
  if (f && b && f !== b) return "mixed";
  return (f ?? b) as DecorationMethod;
}

export function methodLabel(m: DecorationMethod | "mixed" | null | undefined): string {
  if (m === "embroidery") return "Embroidery";
  if (m === "mixed") return "Print + embroidery";
  if (m === "print") return "Print";
  return "No logo";
}
