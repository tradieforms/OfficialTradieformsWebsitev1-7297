import { ArrowLeft, Pencil, ShoppingCart } from "lucide-react";
import { formatAUD, type KitPrice } from "../../../shared/catalogue";
import { backSupported, describePlacement } from "../../lib/garment";
import { GarmentStage } from "../garment-stage";
import { EMBROIDERY_FEE, embroideryFee, garmentMethod, methodLabel } from "../../../shared/decoration";
import { type GarmentPlacementState, type KitGarmentView, kitEmbroidery, liveViews, placementFor } from "./kit-placement";

interface KitReviewStageProps {
  garments: KitGarmentView[];
  placements: Record<string, GarmentPlacementState>;
  logo: { url: string; name: string };
  price: KitPrice;
  discountPercent: number | null;
  ctaLabel: string;
  onEdit: (key: string) => void;
  onBackToPlacement: () => void;
  onBackToKit: () => void;
  onConfirm: () => void;
}

/** Final check before the kit goes to the cart: every garment, its sizes and its own placement. */
export function KitReviewStage({
  garments,
  placements,
  logo,
  price,
  discountPercent,
  ctaLabel,
  onEdit,
  onBackToPlacement,
  onBackToKit,
  onConfirm,
}: KitReviewStageProps) {
  const embroidery = kitEmbroidery(garments, placements);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <ul className="min-w-0 divide-y divide-tf-line border border-tf-line bg-white" aria-label="Bundle review">
        {garments.map((g) => {
          const s = placementFor(g, placements);
          const hasBack = backSupported(g.product, g.colour);
          const lv = liveViews(g, s);
          const fee = embroideryFee(g.pieces, lv.front, lv.back);
          return (
            <li key={g.key} className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] md:p-5">
              <div className="flex gap-2">
                <figure className="w-24 sm:w-28">
                  <div className="tf-stage border border-tf-line">
                    <GarmentStage
                      colour={g.colour}
                      view="front"
                      logoUrl={logo.url}
                      transform={s.front}
                      alt={`${g.name} ${g.colour.name} front with your logo`}
                    />
                  </div>
                  <figcaption className="mt-1 text-center text-[0.68rem] font-semibold text-tf-steel">Front</figcaption>
                </figure>
                {hasBack ? (
                  <figure className="w-24 sm:w-28">
                    <div className="tf-stage border border-tf-line">
                      <GarmentStage
                        colour={g.colour}
                        view="back"
                        silhouette={g.product.silhouette}
                        logoUrl={logo.url}
                        transform={s.back}
                        alt={`${g.name} ${g.colour.name} back${s.back.enabled ? " with your logo" : ""}`}
                      />
                    </div>
                    <figcaption className="mt-1 text-center text-[0.68rem] font-semibold text-tf-steel">Back</figcaption>
                  </figure>
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-[1rem] font-bold text-tf-ink">
                      {g.name} · {g.colour.name}
                    </h3>
                    <p className="mt-0.5 text-[0.8rem] text-tf-steel">
                      {g.pieces} {g.pieces === 1 ? "piece" : "pieces"} ·{" "}
                      {g.sizes.map((x) => `${x.size} × ${x.quantity}`).join(", ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="tf-chip"
                    onClick={() => onEdit(g.key)}
                    aria-label={`Edit logo spots for ${g.name} ${g.colour.name}`}
                  >
                    <Pencil className="size-3.5" aria-hidden /> Edit spots
                  </button>
                </div>
                <dl className="mt-3 grid gap-1 text-[0.82rem] sm:grid-cols-[4rem_minmax(0,1fr)]">
                  <dt className="text-tf-steel">Front</dt>
                  <dd className="font-semibold text-tf-ink">
                    {describePlacement(g.product, g.colour, "front", s.front)}
                    {lv.front ? ` · ${methodLabel(garmentMethod(lv.front, null))}` : ""}
                  </dd>
                  <dt className="text-tf-steel">Back</dt>
                  <dd className="font-semibold text-tf-ink">
                    {hasBack ? describePlacement(g.product, g.colour, "back", s.back) : "Front logo only"}
                    {lv.back ? ` · ${methodLabel(garmentMethod(null, lv.back))}` : ""}
                  </dd>
                  <dt className="text-tf-steel">Extra</dt>
                  <dd className="font-semibold text-tf-ink" data-testid="kit-review-fee">
                    {fee
                      ? `Embroidery ${g.pieces} × ${formatAUD(EMBROIDERY_FEE)} = +${formatAUD(fee)}`
                      : "Printed — no extra charge"}
                  </dd>
                </dl>
              </div>
            </li>
          );
        })}
      </ul>

      <aside aria-label="Bundle summary" className="border border-tf-line-dark bg-tf-navy-deep p-5 text-white lg:sticky lg:top-24">
        <h3 className="font-display text-[1.05rem] font-extrabold text-white">Bundle summary</h3>
        <dl className="mt-4 space-y-2 text-[0.88rem]">
          <div className="flex justify-between gap-4">
            <dt className="text-white/80">Garments</dt>
            <dd className="font-display font-bold">{garments.length}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/80">Pieces</dt>
            <dd className="font-display font-bold">{price.pieces}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/80">Individual prices</dt>
            <dd className="font-display font-bold">{formatAUD(price.fullPrice)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/80">Rate</dt>
            <dd className="text-right font-display font-bold">
              {price.tier ? `${price.tier.tier} · ${discountPercent}% off` : "Individual pricing"}
            </dd>
          </div>
          {price.saving > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-white/80">Bundle saving</dt>
              <dd className="font-display font-bold text-tf-yellow">−{formatAUD(price.saving)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4" data-testid="kit-summary-embroidery">
            <dt className="text-white/80">Embroidery</dt>
            <dd className="text-right font-display font-bold">
              {embroidery.fee
                ? `${embroidery.pieces} × ${formatAUD(EMBROIDERY_FEE)} = +${formatAUD(embroidery.fee)}`
                : "None"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/80">Logo</dt>
            <dd className="max-w-[60%] truncate text-right font-semibold">{logo.name}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/15 pt-4">
          <span className="text-[0.8rem] text-white/80">Total inc. GST, before shipping</span>
          <span className="font-display text-[1.8rem] leading-none font-extrabold text-tf-yellow" data-testid="kit-summary-total">
            {formatAUD(price.total + embroidery.fee)}
          </span>
        </div>
        <p className="mt-3 text-[0.76rem] leading-snug text-white/80">
          Bundle discounts apply to garment prices only; embroidery is {formatAUD(EMBROIDERY_FEE)} per
          embroidered garment. Shipping is calculated at checkout. We confirm every placement with you
          before anything is produced.
        </p>
        <button type="button" className="btn-base btn-primary mt-4 w-full" onClick={onConfirm}>
          <ShoppingCart className="size-4" aria-hidden /> {ctaLabel}
        </button>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            className="btn-base btn-secondary w-full !py-2.5 !text-[0.8rem] text-white hover:text-white"
            onClick={onBackToPlacement}
          >
            <ArrowLeft className="size-4" aria-hidden /> <span>Back to placement</span>
          </button>
          <button
            type="button"
            className="text-[0.8rem] font-semibold text-white/85 underline underline-offset-4 hover:text-white"
            onClick={onBackToKit}
          >
            Change garments, sizes or quantities
          </button>
        </div>
      </aside>
    </div>
  );
}
