import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Info, MoveHorizontal } from "lucide-react";
import { useCatalogue } from "../../queries/catalogue";
import { GarmentStage } from "../garment-stage";
import { Reveal } from "../reveal";
import { placeLogo, productSpots } from "../../../shared/placements";

export const PLACEHOLDER_LOGO = "/images/brand/logo-placeholder.svg";

/**
 * Before/after demonstration of the Design Studio. A real garment stage with
 * a real (transparent) logo overlay, positioned from the same garment print
 * map the studio uses — left chest is the wearer's left.
 */
export function CustomisationDemo() {
  const catalogue = useCatalogue();
  const [placementId, setPlacementId] = useState("left-chest");
  const [split, setSplit] = useState(56);

  const product =
    (catalogue.data?.products ?? []).find((p) => p.slug === "jacket") ??
    catalogue.data?.products?.[0];
  const colour = product?.colours.find((c) => c.source === "supplier") ?? product?.colours[0];
  // The same fixed spots the Design Studio offers (back only where this colour has a photo).
  const presets =
    product && colour
      ? productSpots(product, colour)
          .filter((s) => s.onPhoto)
          .map((s) => ({ id: s.id, label: s.label, view: s.view, transform: placeLogo(product, colour, s) }))
      : [];
  const placement = presets.find((p) => p.id === placementId) ?? presets[0];
  const view = placement?.view ?? "front";

  return (
    <section className="tf-grit bg-tf-navy py-[clamp(4.5rem,9vw,8rem)] text-white">
      <div className="tf-shell grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-16">
        <div>
          <Reveal>
            <h2 className="tf-display text-[clamp(2rem,4.6vw,3.4rem)] text-white">
              Plain uniform in.
              <br />
              Your brand out.
            </h2>
            <p className="mt-5 max-w-lg text-[1.02rem] leading-relaxed text-white/70">
              Upload your logo, then pick an approved print spot — left or right chest, sleeve or
              standard back — on the real garment. Every spot has a set print size, so what you see is
              what we print. Save it as a browser draft, or to your account once you&apos;re signed in.
            </p>
          </Reveal>

          <Reveal delay={90}>
            <div className="mt-9">
              <p className="tf-eyebrow text-white/65">Logo placement</p>
              <fieldset className="m-0 mt-4 flex min-w-0 flex-wrap gap-2 border-0 p-0">
                <legend className="sr-only">Logo placement</legend>
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      placement?.id === p.id
                        ? "tf-chip !border-tf-yellow !bg-tf-yellow !text-tf-navy-deep"
                        : "tf-chip !border-white/25 !bg-white/5 text-white hover:!border-white/60"
                    }
                    data-selected={placement?.id === p.id}
                    aria-pressed={placement?.id === p.id}
                    onClick={() => setPlacementId(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </fieldset>
            </div>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-9">
              <label htmlFor="demo-split" className="tf-eyebrow text-white/65">
                Before / after
              </label>
              <input
                id="demo-split"
                type="range"
                min={12}
                max={92}
                value={split}
                onChange={(e) => setSplit(Number(e.target.value))}
                className="mt-4 h-1.5 w-full max-w-md cursor-pointer appearance-none rounded-full bg-white/20 accent-tf-yellow"
                aria-label="Reveal the branded garment"
              />
            </div>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link to="/design-studio" className="btn-base btn-yellow">
                Design Studio <ArrowRight className="size-4" aria-hidden />
              </Link>
              <p className="flex max-w-xs items-start gap-2 text-[0.78rem] leading-snug text-white/80">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Live demonstration with a sample logo. Upload your own, pick your spots and save in
                the Design Studio — no card details needed.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={60}>
          <div className="relative">
            <div className="relative overflow-hidden border border-white/10 bg-white">
              <div className="tf-stage relative">
                {product && colour && placement ? (
                  <>
                    <GarmentStage
                      colour={colour}
                      view={view}
                      transform={{ ...placement.transform, enabled: false }}
                      alt={`${product.name} without branding`}
                    />
                    <div
                      className="absolute inset-0"
                      style={{ clipPath: `inset(0 0 0 ${split}%)` }}
                    >
                      <GarmentStage
                        colour={colour}
                        view={view}
                        logoUrl={PLACEHOLDER_LOGO}
                        transform={placement.transform}
                        alt={`${product.name} with your logo on the ${placement.label.toLowerCase()}`}
                      />
                    </div>
                  </>
                ) : (
                  <div className="aspect-square w-full animate-pulse bg-tf-paper-dim" />
                )}

                {/* Divider */}
                <div
                  className="pointer-events-none absolute inset-y-0 z-20 w-[2px] bg-tf-yellow"
                  style={{ left: `${split}%` }}
                  aria-hidden
                >
                  <span className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-tf-yellow bg-tf-navy-deep">
                    <MoveHorizontal className="size-4 text-tf-yellow" />
                  </span>
                </div>

                <span className="pointer-events-none absolute top-3 left-3 z-10 bg-tf-navy-deep/85 px-2.5 py-1 font-display text-[0.62rem] font-bold tracking-[0.14em] text-white uppercase">
                  Plain
                </span>
                <span className="pointer-events-none absolute top-3 right-3 z-10 bg-tf-yellow px-2.5 py-1 font-display text-[0.62rem] font-bold tracking-[0.14em] text-tf-navy-deep uppercase">
                  Branded
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tf-line bg-white px-4 py-3">
                <p className="font-display text-[0.78rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  {product?.name ?? "Jacket"} · {colour?.name ?? "Navy"}
                </p>
                <p className="text-[0.74rem] font-semibold tracking-[0.08em] text-tf-steel uppercase">
                  Placement: {placement?.label ?? "—"}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
