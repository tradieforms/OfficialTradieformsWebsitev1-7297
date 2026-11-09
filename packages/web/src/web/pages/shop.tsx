import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "../components/layout";
import { ProductCard } from "../components/product-card";
import { BundleCard } from "../components/bundle-card";
import { Reveal } from "../components/reveal";
import { useCatalogue } from "../queries/catalogue";

const CATEGORIES = ["All", "Outerwear", "Tops", "Headwear"] as const;
const SORTS = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
  { id: "name", label: "Name A–Z" },
] as const;

export default function ShopPage() {
  const search = useSearch();
  const initialCategory = new URLSearchParams(search).get("category") ?? "All";
  const [category, setCategory] = useState<string>(
    CATEGORIES.includes(initialCategory as (typeof CATEGORIES)[number]) ? initialCategory : "All",
  );
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("featured");
  const catalogue = useCatalogue();

  const products = useMemo(() => {
    const list = (catalogue.data?.products ?? []).filter(
      (p) => category === "All" || p.category === category,
    );
    const sorted = [...list];
    switch (sort) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        sorted.sort((a, b) => Number(b.featured) - Number(a.featured));
    }
    return sorted;
  }, [catalogue.data, category, sort]);

  return (
    <>
      <PageIntro
        title={
          <>
            Kit the crew.
            <br />
            One order.
          </>
        }
        intro="Pick a bundle or grab single pieces. Every item opens the logo mockup builder before checkout."
      />

      <section className="bg-white py-14 md:py-20">
        <div className="tf-shell">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="tf-display text-[clamp(1.6rem,3.4vw,2.4rem)] text-tf-ink">
                Locked-in seasonal pricing
              </h2>
              <p className="mt-3 max-w-xl text-[0.9rem] leading-relaxed text-tf-steel">
                Choose your own garments and quantities. Once your kit reaches a tier&apos;s piece
                count, that tier&apos;s rate applies to the whole kit.
              </p>
            </div>
            <Link to="/bundle-deals" className="btn-base btn-secondary text-tf-navy">
              <span>Open the bundle builder</span> <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          {catalogue.isLoading ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse border border-tf-line">
                  <div className="aspect-[16/11] bg-tf-paper-dim" />
                  <div className="h-32 bg-white" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {(catalogue.data?.bundles ?? []).map((bundle, i) => (
                <Reveal key={bundle.id} delay={i * 55} as="div" className="h-full">
                  <BundleCard bundle={bundle} compact />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-tf-line bg-tf-paper py-14 md:py-20">
        <div className="tf-shell">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="tf-display text-[clamp(1.6rem,3.4vw,2.4rem)] text-tf-ink">
                Brand any piece
              </h2>
            </div>

            <div className="flex flex-wrap items-end gap-6">
              <div>
                <span className="tf-eyebrow block text-tf-steel">Category</span>
                <fieldset className="m-0 mt-3 flex min-w-0 flex-wrap gap-2 border-0 p-0">
                  <legend className="sr-only">Filter by category</legend>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="tf-chip"
                      aria-pressed={category === c}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </fieldset>
              </div>

              <div>
                <label htmlFor="sort" className="tf-eyebrow block text-tf-steel">
                  Sort
                </label>
                <select
                  id="sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="tf-input mt-3 !w-auto min-w-[13rem]"
                >
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {catalogue.isLoading ? (
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse border border-tf-line bg-white">
                  <div className="aspect-[4/5] bg-tf-paper-dim" />
                  <div className="h-28 bg-white" />
                </div>
              ))}
            </div>
          ) : catalogue.isError ? (
            <p className="mt-10 border border-tf-orange/40 bg-tf-orange/5 p-5 text-sm">
              We couldn&apos;t load the range. Refresh the page to try again.
            </p>
          ) : products.length === 0 ? (
            <p className="mt-10 text-sm text-tf-steel">Nothing in this category yet.</p>
          ) : (
            <>
              <p className="mt-8 text-[0.78rem] font-semibold tracking-[0.1em] text-tf-steel uppercase">
                {products.length} {products.length === 1 ? "item" : "items"}
              </p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {products.map((product, i) => (
                  <Reveal key={product.slug} delay={i * 45} as="div">
                    <ProductCard product={product} index={i} />
                  </Reveal>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
