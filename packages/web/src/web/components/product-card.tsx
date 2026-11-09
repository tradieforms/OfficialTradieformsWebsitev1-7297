import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { type Product, formatAUD, fromPrice } from "../../shared/catalogue";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const from = fromPrice(product);
  const price = from.varies ? `From ${formatAUD(from.price)}` : formatAUD(from.price);
  return (
    <article className="group relative flex flex-col border border-tf-line bg-white transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_26px_50px_-34px_rgba(6,21,46,0.55)]">
      {product.badge ? (
        <span className="absolute top-3 left-3 z-10 bg-tf-navy px-2.5 py-1 font-display text-[0.62rem] font-bold tracking-[0.14em] text-tf-yellow uppercase">
          {product.badge}
        </span>
      ) : null}

      <Link
        to={`/product/${product.slug}`}
        className="tf-stage relative block aspect-[4/5] overflow-hidden"
        aria-label={`${product.name}, ${price} — customise`}
      >
        <img
          src={product.image}
          alt={product.name}
          loading={index < 4 ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-[1.045]"
        />
        <span className="absolute right-3 bottom-3 flex items-center gap-1 bg-tf-navy px-2.5 py-1.5 font-display text-[0.66rem] font-bold tracking-[0.12em] text-white uppercase opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          Customise <ArrowUpRight className="size-3" aria-hidden />
        </span>
      </Link>

      <div className="flex flex-1 flex-col border-t border-tf-line p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-[1.02rem] font-bold tracking-[-0.01em] text-tf-ink">
            {product.name}
          </h3>
          <p className="font-display text-[1.02rem] font-bold text-tf-navy">
            {price}
          </p>
        </div>
        <p className="mt-1 text-[0.8rem] text-tf-steel">{product.tagline}</p>

        <div className="mt-3 flex items-center gap-2">
          <span className="flex items-center gap-1.5" aria-label={`${product.colours.length} colours`}>
            {product.colours.slice(0, 4).map((colour) => (
              <span
                key={colour.id}
                title={colour.name}
                className="size-3.5 rounded-full border border-tf-line"
                style={{ background: colour.hex }}
              />
            ))}
          </span>
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-tf-steel uppercase">
            {product.colours.length} {product.colours.length === 1 ? "colour" : "colours"}
          </span>
        </div>

        <Link
          to={`/product/${product.slug}`}
          className="btn-base btn-secondary mt-4 !py-2.5 text-tf-navy hover:text-tf-navy"
        >
          <span>Customise</span>
        </Link>
      </div>
    </article>
  );
}
