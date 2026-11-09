import { getProduct } from "../../../shared/catalogue";
import type { LogoTransform } from "../../lib/cart";
import { backSupported, describePlacement, fitLogo } from "../../lib/garment";
import { GarmentStage } from "../garment-stage";
import { EMBROIDERY_FEE, embroideryFee, methodLabel, viewMethod } from "../../../shared/decoration";
import { formatAUD } from "../../../shared/catalogue";

export interface PlacedGarment {
  slug: string;
  colourId: string;
  /** Saved orders: the option and its customer-facing name. */
  variantId?: string;
  name?: string;
  frontLogo: LogoTransform | null;
  backLogo: LogoTransform | null;
  /** "M × 10, L × 5" style breakdown, when known. */
  sizes?: { size: string; quantity: number }[];
}

/** Compact per-garment placement list for the cart and order pages. */
export function KitPlacementSummary({
  garments,
  logoUrl,
}: {
  garments: PlacedGarment[];
  logoUrl: string | null;
}) {
  return (
    <ul className="mt-2 divide-y divide-tf-line">
      {garments.map((g) => {
        const product = getProduct(g.slug);
        const colour = product?.colours.find((c) => c.id === g.colourId);
        if (!product || !colour) return null;
        const hasBack = backSupported(product, colour);
        // Older carts may hold free-positioned logos: show them at the nearest fixed spot.
        const front = g.frontLogo ? fitLogo(product, colour, "front", g.frontLogo) : null;
        const back = g.backLogo ? fitLogo(product, colour, "back", g.backLogo) : null;
        const fm = viewMethod(front);
        const bm = hasBack ? viewMethod(back) : null;
        const pieces = g.sizes?.reduce((n, s) => n + s.quantity, 0) ?? 0;
        const fee = pieces ? embroideryFee(pieces, front, hasBack ? back : null) : 0;
        return (
          <li key={`${g.slug}|${g.variantId ?? ""}|${g.colourId}`} className="flex gap-3 py-2.5">
            <span className="tf-stage block size-14 shrink-0 border border-tf-line bg-white">
              <GarmentStage colour={colour} view="front" logoUrl={logoUrl} transform={front} alt="" />
            </span>
            {hasBack && back?.enabled ? (
              <span className="tf-stage block size-14 shrink-0 border border-tf-line bg-white">
                <GarmentStage
                  colour={colour}
                  view="back"
                  silhouette={product.silhouette}
                  logoUrl={logoUrl}
                  transform={back}
                  alt=""
                />
              </span>
            ) : null}
            <span className="min-w-0 text-[0.78rem] leading-snug">
              <span className="block font-semibold text-tf-ink">
                {g.name ?? product.name} · {colour.name}
                {g.sizes?.length ? (
                  <span className="font-normal text-tf-steel">
                    {" "}
                    — {g.sizes.map((s) => `${s.size} × ${s.quantity}`).join(", ")}
                  </span>
                ) : null}
              </span>
              <span className="block text-tf-steel">
                Front: {describePlacement(product, colour, "front", g.frontLogo)}
                {fm ? ` · ${methodLabel(fm)}` : ""}
              </span>
              <span className="block text-tf-steel">
                Back: {hasBack ? describePlacement(product, colour, "back", g.backLogo) : "front logo only"}
                {bm ? ` · ${methodLabel(bm)}` : ""}
              </span>
              {fee ? (
                <span className="block font-semibold text-tf-ink" data-testid="kit-summary-fee">
                  Embroidery: {pieces} × {formatAUD(EMBROIDERY_FEE)} = +{formatAUD(fee)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Groups a bundle line's size entries by garment for display. */
export function sizesByGarment(sizes: { slug: string; size: string; quantity: number; colourId?: string }[] = []) {
  const map = new Map<string, { size: string; quantity: number }[]>();
  for (const s of sizes) {
    const key = `${s.slug}|${s.colourId ?? getProduct(s.slug)?.defaultColour ?? ""}`;
    const list = map.get(key) ?? [];
    const same = list.find((x) => x.size === s.size);
    if (same) same.quantity += s.quantity;
    else list.push({ size: s.size, quantity: s.quantity });
    map.set(key, list);
  }
  return map;
}
