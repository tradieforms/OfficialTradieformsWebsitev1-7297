import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useCatalogue } from "../../queries/catalogue";
import { ProductCard } from "../product-card";
import { Reveal } from "../reveal";
import { cn } from "../../lib/utils";

const FILTERS = ["All", "Outerwear", "Tops", "Headwear"] as const;

export function FeaturedWorkwear() {
  const catalogue = useCatalogue();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const products = (catalogue.data?.products ?? []).filter(
    (p) => filter === "All" || p.category === filter,
  );

  return (
    <section className="bg-white py-[clamp(4.5rem,9vw,8rem)]">
      <div className="tf-shell">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <Reveal>
            <h2 className="tf-display text-[clamp(2rem,4.6vw,3.4rem)] text-tf-ink">
              Your gear.
              <br />
              Branded your way.
            </h2>
          </Reveal>
          <Reveal delay={80} className="md:pb-2">
            <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
              <legend className="sr-only">Filter by category</legend>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className="tf-chip"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </fieldset>
          </Reveal>
        </div>

        {catalogue.isLoading ? (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse border border-tf-line">
                <div className="aspect-[4/5] bg-tf-paper-dim" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-2/3 bg-tf-paper-dim" />
                  <div className="h-3 w-1/3 bg-tf-paper-dim" />
                </div>
              </div>
            ))}
          </div>
        ) : catalogue.isError ? (
          <p className="mt-10 border border-tf-orange/40 bg-tf-orange/5 p-5 text-sm text-tf-ink">
            We couldn&apos;t load the range. Refresh the page, or{" "}
            <Link to="/contact" className="underline">
              let us know
            </Link>
            .
          </p>
        ) : (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product, i) => (
              <Reveal key={product.slug} delay={i * 55} as="div">
                <ProductCard product={product} index={i} />
              </Reveal>
            ))}
          </div>
        )}

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link to="/shop" className="btn-base btn-primary">
            Shop all gear <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="text-[0.85rem] text-tf-steel">
            Every item opens the logo mockup builder before checkout.
          </p>
        </div>
      </div>

      <div className={cn("tf-hatch mt-[clamp(4rem,8vw,7rem)] h-24 w-full")} aria-hidden />
    </section>
  );
}
