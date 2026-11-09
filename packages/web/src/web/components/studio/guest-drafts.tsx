import { useState } from "react";
import { Link } from "wouter";
import { HardDrive, Pencil, Trash2 } from "lucide-react";
import { garmentName, getProduct } from "../../../shared/catalogue";
import { GarmentStage } from "../garment-stage";
import { deleteDraft, useDrafts } from "../../lib/drafts";
import { useSignedLogos } from "../../lib/signed-logos";
import { backSupported, fitLogo, spotLabel } from "../../lib/garment";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Lists guest drafts saved in this browser. Renders nothing when there are
 * none. Wording is explicit that these live only in this browser.
 */
export function GuestDrafts({ signedIn = false, compact = false }: { signedIn?: boolean; compact?: boolean }) {
  const drafts = useDrafts();
  const logos = useSignedLogos(drafts.map((d) => d.logoKey));
  const [confirm, setConfirm] = useState<string | null>(null);

  if (drafts.length === 0) return null;

  return (
    <section
      aria-labelledby="guest-drafts-title"
      className={compact ? "mt-12" : "border-t border-tf-line bg-white py-[clamp(3rem,6vw,5rem)]"}
    >
      <div className={compact ? "" : "tf-shell"}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 id="guest-drafts-title" className="tf-display text-[clamp(1.4rem,3vw,2rem)] text-tf-ink">
              Drafts saved on this device
            </h2>
          </div>
          <p className="flex max-w-md gap-2 text-[0.85rem] leading-relaxed text-tf-steel">
            <HardDrive className="mt-0.5 size-4 shrink-0 text-tf-navy" aria-hidden />
            {signedIn
              ? "These were saved as a guest and live only in this browser. Open one and use “Save to my account” to keep it on your account."
              : "Saved only in this browser. They won't follow you to another device and are lost if site data is cleared. Sign in to save designs to an account."}
          </p>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {drafts.map((d) => {
            const product = getProduct(d.productSlug);
            const colour = product?.colours.find((c) => c.id === d.colourId) ?? product?.colours[0];
            const front = product && colour && d.frontLogo ? fitLogo(product, colour, "front", d.frontLogo) : null;
            const back = product && colour && d.backLogo ? fitLogo(product, colour, "back", d.backLogo) : null;
            const showBack = Boolean(d.view === "back" && back?.enabled && product && backSupported(product));
            const spots = [spotLabel(front), spotLabel(back)].filter(Boolean).join(" + ");
            const logoUrl = d.logoKey ? logos[d.logoKey] : null;
            return (
              <article key={d.id} className="flex flex-col border border-tf-line bg-white">
                <div className="tf-stage relative aspect-square">
                  {product && colour ? (
                    <GarmentStage
                      colour={colour}
                      view={showBack ? "back" : "front"}
                      silhouette={product.silhouette}
                      logoUrl={logoUrl ?? null}
                      transform={showBack ? back : front}
                      alt={`${d.name} — ${product.name} in ${colour.name}`}
                    />
                  ) : (
                    <p className="grid h-full place-items-center px-6 text-center text-sm text-tf-steel">
                      This garment is no longer in the range.
                    </p>
                  )}
                </div>
                <div className="flex flex-1 flex-col border-t border-tf-line p-4">
                  <h3 className="font-display text-[0.98rem] font-bold text-tf-ink">{d.name}</h3>
                  <p className="mt-1 text-[0.78rem] text-tf-steel">
                    {product ? garmentName(product, d.variantId) : d.productSlug} · {colour?.name ?? d.colourId} · Size {d.size}
                  </p>
                  <p className="mt-0.5 text-[0.74rem] text-tf-steel">
                    {d.logoKey ? (logoUrl === null ? "Logo file unavailable" : spots || "Logo uploaded, no spot") : "No logo"} · {formatDate(d.updatedAt)}
                  </p>
                  <div className="mt-4 flex items-center gap-2 border-t border-tf-line pt-3">
                    <Link
                      to={`/design-studio?draft=${d.id}`}
                      className="btn-base btn-primary !px-3.5 !py-2 !text-[0.76rem]"
                    >
                      <Pencil className="size-3.5" aria-hidden /> Open
                    </Link>
                    {confirm === d.id ? (
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn-base !bg-tf-cta !px-3 !py-2 !text-[0.74rem] text-white"
                          onClick={() => {
                            deleteDraft(d.id);
                            setConfirm(null);
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="text-[0.74rem] font-semibold text-tf-steel underline"
                          onClick={() => setConfirm(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="grid size-9 place-items-center border border-tf-line text-tf-steel hover:border-tf-orange hover:text-tf-rust"
                        aria-label={`Delete draft ${d.name}`}
                        onClick={() => setConfirm(d.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
