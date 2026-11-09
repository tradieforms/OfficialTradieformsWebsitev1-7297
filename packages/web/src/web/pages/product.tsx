import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  type Product,
  familyOf,
  formatAUD,
  getVariant,
  offeredColour,
  variantColours,
} from "../../shared/catalogue";
import { PageIntro } from "../components/layout";
import { ProductCard } from "../components/product-card";
import { Reveal } from "../components/reveal";
import { GarmentStage } from "../components/garment-stage";
import { useCatalogue, useProduct } from "../queries/catalogue";
import { type GarmentView, resolveView } from "../lib/garment";
import { cn } from "../lib/utils";
import { SPOT_DEFS } from "../../shared/placements";

/** "Left Chest, Right Chest, Left Sleeve, Right Sleeve or Standard Back". */
function spotList(product: Product) {
  const labels = product.placements.map((id) => SPOT_DEFS[id].label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearch();
  const designParam = new URLSearchParams(search).get("design");

  const product = useProduct(params?.slug);
  const catalogue = useCatalogue();
  const [, navigate] = useLocation();

  const [previewView, setPreviewView] = useState<GarmentView>("front");
  const [previewColourId, setPreviewColourId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);

  const data = product.data as Product | undefined;

  // Old saved-design links (/product/:slug?design=ID) now open in the Design Studio.
  useEffect(() => {
    if (designParam) navigate(`/design-studio?design=${encodeURIComponent(designParam)}`, { replace: true });
  }, [designParam, navigate]);

  const [colourNotice, setColourNotice] = useState<string | null>(null);

  const variant = data ? (getVariant(data, variantId) ?? getVariant(data)) : undefined;
  // Only the colours made in the chosen fabric option are shown (black polo = stretch cotton only).
  const colourChoices = data ? variantColours(data, variant?.id) : [];
  const previewColour = useMemo(
    () => (data ? offeredColour(data, variant?.id, previewColourId) : null),
    [data, variant?.id, previewColourId],
  );
  const family = data ? familyOf(data) : [];
  const studioHref = data
    ? `/design-studio?product=${data.slug}${variant && data.variants.length > 1 ? `&variant=${variant.id}` : ""}${
        previewColour && previewColourId ? `&colour=${previewColour.id}` : ""
      }`
    : "/design-studio";

  /** Option change: a colour the new fabric isn't made in moves to one it is, and says so. */
  const chooseVariant = (id: string) => {
    if (!data) return;
    setVariantId(id);
    const v = getVariant(data, id);
    const next = offeredColour(data, id, previewColour?.id);
    if (previewColour && next.id !== previewColour.id && v) {
      setPreviewColourId(next.id);
      setColourNotice(`${previewColour.name} isn't made in ${v.label.toLowerCase()} — showing ${next.name}.`);
    } else {
      setColourNotice(null);
    }
  };

  // Reset the option when moving between product pages (e.g. jacket → jacket).
  useEffect(() => {
    setVariantId(null);
    setPreviewColourId(null);
    setColourNotice(null);
  }, [params?.slug]);

  // A colour with no back photo (black polo) drops back to the front — a front photo is never shown as a back.
  useEffect(() => {
    if (previewColour && previewView === "back" && !resolveView(previewColour, "back")) setPreviewView("front");
  }, [previewColour, previewView]);

  const previewResolved = previewColour ? resolveView(previewColour, previewView) : null;

  const related = useMemo(() => {
    if (!data) return [];
    return (catalogue.data?.products ?? [])
      .filter((p) => p.slug !== data.slug)
      .sort((a, b) => Number(b.category === data.category) - Number(a.category === data.category))
      .slice(0, 4);
  }, [catalogue.data, data]);

  if (product.isLoading) {
    return (
      <div className="tf-shell flex min-h-[60vh] items-center gap-3 py-24 text-sm text-tf-steel">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the garment…
      </div>
    );
  }

  if (product.isError || !data) {
    return (
      <>
        <PageIntro
          title="We don't stock that one."
          intro="The garment you're after isn't in the range. Head back to the shop and pick from what is."
        />
        <div className="tf-shell py-14">
          <Link to="/shop" className="btn-base btn-primary">
            <ArrowLeft className="size-4" aria-hidden /> Back to the shop
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageIntro
        title={data.name}
        intro={data.description}
      >
        <div className="mt-7 flex flex-wrap items-center gap-5">
          <p className="font-display text-[2rem] leading-none font-extrabold text-tf-yellow">
            {formatAUD(variant?.price ?? data.price)}
          </p>
          <span className="text-[0.78rem] font-semibold tracking-[0.1em] text-white/55 uppercase">
            inc. GST · {data.sizes.length} {data.sizes.length === 1 ? "size" : "sizes"} ·{" "}
            {colourChoices.length} {colourChoices.length === 1 ? "colour" : "colours"}
          </span>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to={studioHref} className="btn-base btn-primary">
            Customise in Design Studio <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link to="/bundle-deals" className="btn-base btn-secondary text-white hover:text-white">
            <span>Add to a bundle</span>
          </Link>
        </div>
      </PageIntro>

      {/* ---------- The garment: real photography, front and back ---------- */}
      <section className="bg-white py-14 md:py-20">
        <div className="tf-shell grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <Reveal>
            <div className="border border-tf-line bg-white">
              <div className="tf-stage relative aspect-square">
                {previewResolved ? (
                  <GarmentStage
                    colour={previewColour!}
                    view={previewView}
                    resolved={previewResolved}
                    alt={`${data.name} in ${previewColour?.name}, ${previewView} view`}
                  />
                ) : (
                  <p className="grid h-full place-items-center px-8 text-center text-sm text-tf-steel">
                    No {previewView} photography for {previewColour?.name} yet.
                  </p>
                )}
                {previewColour?.source === "tint" ? (
                  <span className="pointer-events-none absolute top-3 right-3 bg-tf-cta px-2.5 py-1 font-display text-[0.62rem] font-bold tracking-[0.14em] text-white uppercase">
                    Rendered preview
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-tf-line px-4 py-3">
                <fieldset className="m-0 flex min-w-0 gap-2 border-0 p-0">
                  <legend className="sr-only">View</legend>
                  {(["front", "back"] as GarmentView[]).map((v) => {
                    const available = previewColour ? Boolean(resolveView(previewColour, v)) : false;
                    return (
                      <button
                        key={v}
                        type="button"
                        className="tf-chip capitalize"
                        aria-pressed={previewView === v}
                        disabled={!available}
                        onClick={() => setPreviewView(v)}
                        title={available ? undefined : "No photography for this view yet"}
                      >
                        {v}
                      </button>
                    );
                  })}
                </fieldset>
                <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-tf-steel uppercase">
                  {previewColour?.source === "tint" ? "Rendered preview" : "Supplier photo"}
                </span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h2 className="tf-display text-[clamp(1.6rem,3.4vw,2.4rem)] text-tf-ink">
              {data.tagline}
            </h2>
            <p className="mt-4 text-[0.98rem] leading-relaxed text-tf-steel">
              Supplier photography is used wherever it exists. Colours marked{" "}
              <span className="font-semibold text-tf-rust">rendered preview</span> are re-shaded from
              the supplier photo of another colour — fabric, seams and folds are kept, but small trims
              may take the new colour too. The finished garment comes in the supplier's true shade.
            </p>

            {variant?.material ? (
              <p data-material className="mt-5 text-[0.92rem] text-tf-ink">
                <span className="font-semibold">Material:</span> {variant.material}
                {variant.fabricWeight ? ` · ${variant.fabricWeight}` : ""}
              </p>
            ) : null}

            {family.length > 1 ? (
              <div data-family className="mt-6">
                <h3 className="tf-eyebrow text-tf-steel">Jacket styles</h3>
                <div className="mt-2 grid gap-2">
                  {family.map((fp) => {
                    const fv = getVariant(fp)!;
                    const current = fp.slug === data.slug;
                    return (
                      <Link
                        key={fp.slug}
                        to={`/product/${fp.slug}`}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 border px-3 py-2.5 transition-colors",
                          current ? "border-tf-navy bg-tf-paper ring-1 ring-tf-navy" : "border-tf-line hover:border-tf-navy/40",
                        )}
                      >
                        <img src={fp.image} alt="" className="size-12 shrink-0 object-contain" loading="lazy" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-display text-[0.9rem] font-bold text-tf-ink">{fp.name}</span>
                          <span className="block text-[0.76rem] text-tf-steel">{fv.material}</span>
                        </span>
                        <span className="font-display text-[0.9rem] font-bold text-tf-navy">{formatAUD(fv.price)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {data.variants.length > 1 ? (
              <fieldset data-variants className="m-0 mt-6 grid min-w-0 gap-2 border-0 p-0">
                <legend className="tf-eyebrow mb-2 text-tf-steel">Options</legend>
                {data.variants.map((v) => {
                  const selected = v.id === variant?.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => chooseVariant(v.id)}
                      data-variant={v.id}
                      className={cn(
                        "flex items-center gap-3 border px-3 py-2.5 text-left transition-colors",
                        selected ? "border-tf-navy bg-tf-paper ring-1 ring-tf-navy" : "border-tf-line hover:border-tf-navy/40",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[0.9rem] font-bold text-tf-ink">{v.name}</span>
                        <span className="block text-[0.76rem] text-tf-steel">
                          {[v.material, v.fabricWeight].filter(Boolean).join(" · ")}
                        </span>
                        {v.colours ? (
                          <span data-variant-colours className="mt-0.5 block text-[0.74rem] text-tf-steel">
                            <span className="font-semibold text-tf-ink">Colours:</span>{" "}
                            {variantColours(data, v.id).map((c) => c.name).join(", ")}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-display text-[0.9rem] font-bold text-tf-navy">{formatAUD(v.price)}</span>
                      {selected ? <Check className="size-4 shrink-0 text-tf-navy" aria-hidden /> : null}
                    </button>
                  );
                })}
              </fieldset>
            ) : null}

            {colourNotice ? (
              <p
                data-colour-notice
                aria-live="polite"
                className="mt-5 border-l-2 border-tf-yellow bg-tf-paper px-3 py-2 text-[0.84rem] text-tf-ink"
              >
                {colourNotice}
              </p>
            ) : null}
            <div data-colours className="mt-6 grid gap-2 sm:grid-cols-2">
              {colourChoices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-colour={c.id}
                  onClick={() => {
                    setColourNotice(null);
                    setPreviewColourId(c.id);
                  }}
                  aria-pressed={c.id === (previewColour?.id ?? data.defaultColour)}
                  aria-label={`${c.name} — ${c.source === "supplier" ? "supplier photo" : "rendered preview"}`}
                  className={cn(
                    "flex items-center gap-3 border px-3 py-2.5 text-left transition-colors",
                    c.id === (previewColour?.id ?? data.defaultColour)
                      ? "border-tf-navy bg-tf-paper"
                      : "border-tf-line hover:border-tf-navy/40",
                  )}
                >
                  <span
                    className="size-7 shrink-0 rounded-full border border-tf-line"
                    style={{ background: c.hex }}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block font-display text-[0.85rem] font-bold text-tf-ink">
                      {c.name}
                    </span>
                    <span className="block text-[0.72rem] font-semibold tracking-[0.06em] text-tf-steel uppercase">
                      {c.source === "supplier" ? "Supplier photo" : "Rendered preview"}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <h3 className="tf-display mt-9 text-[1.05rem] text-tf-ink">What you get</h3>
            <ul className="mt-4 space-y-3">
              {data.details.map((d) => (
                <li key={d} className="flex gap-3 text-[0.95rem] text-tf-steel">
                  <Check className="mt-0.5 size-4 shrink-0 text-tf-navy" aria-hidden />
                  {d}
                </li>
              ))}
            </ul>

            <p className="mt-8 border-l-2 border-tf-yellow bg-tf-paper px-4 py-3 text-[0.85rem] leading-relaxed text-tf-steel">
              Sizing runs true to standard AU workwear. Measurement charts come from our supplier and
              are confirmed on your order confirmation — ask us for the current chart any time.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------- Design Studio hand-off ---------- */}
      <section className="tf-grit border-y border-tf-line-dark bg-tf-navy py-14 text-white md:py-20">
        <div className="tf-shell grid gap-8 md:grid-cols-[1.4fr_auto] md:items-end">
          <div className="max-w-2xl">
            <h2 className="tf-display text-[clamp(1.9rem,4.6vw,3.4rem)] text-white">
              Put your logo on the {data.name.toLowerCase()}.
            </h2>
            <p className="mt-4 text-[1rem] leading-relaxed text-white/80">
              Pick the colour and size, upload your logo, then{" "}
              {data.placements.length > 1
                ? `choose one of the fixed logo spots: ${spotList(data)}.`
                : `place it on the fixed ${spotList(data)} spot.`}{" "}
              Each spot prints at a set size, so the preview matches production. No card details
              needed — save a draft and come back to it.
            </p>
          </div>
          <Link to={studioHref} className="btn-base btn-primary justify-self-start">
            Open Design Studio <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* ---------- Rest of the range ---------- */}
      <section className="bg-tf-paper py-14 md:py-20">
        <div className="tf-shell">
          <h2 className="tf-display text-[clamp(1.6rem,3.4vw,2.4rem)] text-tf-ink">
            The rest of the range
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p, i) => (
              <Reveal key={p.slug} delay={i * 45} as="div">
                <ProductCard product={p} index={i} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
