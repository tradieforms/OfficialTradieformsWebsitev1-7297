import type { LogoTransform } from "./cart";

export interface RestoredDesign {
  /** Account design id (null for a browser-only guest draft). */
  designId: number | null;
  /** Guest draft id (null for an account design). */
  draftId: string | null;
  designName: string;
  productSlug: string;
  /** Product variant; null = saved before variants existed (studio uses the default). */
  variantId: string | null;
  colourId: string;
  size: string;
  logoKey: string | null;
  logoUrl: string | null;
  logoName: string | null;
  frontLogo: LogoTransform | null;
  backLogo: LogoTransform | null;
  view: "front" | "back";
  /** Set when the logo file could not be fetched — the design is restored without it. */
  logoMissing?: boolean;
}

/**
 * Designs store each logo as a JSON string. Keeps the fixed-spot id + production
 * spec; older free-positioned logos come back as x/y/scale only and are mapped to
 * the nearest spot by the studio (fitLogo). Anything unparseable = no logo placed.
 */
export function parseTransform(raw: string | null | undefined): LogoTransform | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LogoTransform>;
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number" || typeof parsed?.scale !== "number") {
      return null;
    }
    return {
      ...(parsed.placementId ? { placementId: parsed.placementId } : {}),
      ...(parsed.production ? { production: parsed.production } : {}),
      ...(typeof parsed.height === "number" ? { height: parsed.height } : {}),
      ...(parsed.migrated ? { migrated: true } : {}),
      ...(parsed.method === "embroidery" || parsed.method === "print" ? { method: parsed.method } : {}),
      x: parsed.x,
      y: parsed.y,
      scale: parsed.scale,
      rotation: typeof parsed.rotation === "number" ? parsed.rotation : 0,
      enabled: parsed.enabled ?? true,
    };
  } catch {
    return null;
  }
}
