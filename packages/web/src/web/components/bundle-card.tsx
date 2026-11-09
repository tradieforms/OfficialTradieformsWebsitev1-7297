import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { formatAUD } from "../../shared/catalogue";

export interface BundleView {
  id: string;
  name: string;
  tier: string;
  price: number;
  pieces: number;
  image: string;
  contents: string;
  fullPrice: number;
  saving: number;
  discountPercent?: number;
}

/**
 * A seasonal pricing tier. The preset mix is shown as an example starting
 * point only — the customer chooses their own garments and quantities on the
 * bundle builder, and the tier rate applies once the kit reaches `pieces`.
 *
 * The footer stacks price above the action at every width: side-by-side, the
 * compact 4-up shop grid squeezed the button over the price.
 */
export function BundleCard({ bundle, compact = false }: { bundle: BundleView; compact?: boolean }) {
  const pct =
    bundle.discountPercent ??
    (bundle.fullPrice > 0 ? Math.round((bundle.saving / bundle.fullPrice) * 1000) / 10 : 0);
  return (
    <article className="group flex h-full flex-col border border-tf-line bg-white">
      <div className="relative overflow-hidden">
        <img
          src={bundle.image}
          alt={`${bundle.name} — ${bundle.tier}, ${bundle.pieces} pieces`}
          loading="lazy"
          className="aspect-[37/27] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute top-0 left-0 bg-tf-yellow px-3 py-1.5 font-display text-[0.68rem] font-black tracking-[0.14em] text-tf-navy-deep uppercase">
          {bundle.pieces}+ pieces
        </span>
        {pct > 0 ? (
          <span className="absolute right-0 bottom-0 bg-tf-cta px-3 py-1.5 font-display text-[0.68rem] font-bold tracking-[0.1em] text-white uppercase">
            {pct}% off
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="tf-display text-[1.35rem] text-tf-ink">{bundle.tier}</h3>
        <p className="mt-1 text-[0.85rem] font-semibold text-tf-navy">{bundle.name}</p>
        <p className="mt-2 text-[0.85rem] leading-relaxed text-tf-steel">
          Any mix of {bundle.pieces} or more pieces. Example mix: {bundle.contents}.
        </p>

        <div className="mt-auto border-t border-tf-line pt-4">
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-display text-[1.5rem] leading-none font-extrabold text-tf-navy">
              {formatAUD(bundle.price)}
            </p>
            <p className="text-[0.74rem] text-tf-steel">
              example mix · full price {formatAUD(bundle.fullPrice)}
            </p>
          </div>
          <Link
            to={`/bundle-deals?start=${bundle.id}`}
            className={
              compact
                ? "btn-base btn-secondary mt-4 w-full !py-2.5 !text-[0.8rem] text-tf-navy"
                : "btn-base btn-primary mt-4 w-full"
            }
          >
            <span>{compact ? "Build this kit" : "Build your kit"}</span>
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}
