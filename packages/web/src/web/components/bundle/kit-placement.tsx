import { useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Copy, Info, ListChecks } from "lucide-react";
import type { GarmentColour, PlacementId, Product } from "../../../shared/catalogue";
import { hasBackPhoto } from "../../../shared/placements";
import type { LogoTransform } from "../../lib/cart";
import {
  type GarmentView,
  backSupported,
  defaultTransform,
  describePlacement,
  spotLabel,
  spotLogo,
  transferPlacement,
  viewSpots,
} from "../../lib/garment";
import { cn } from "../../lib/utils";
import { type DecorationMethod, EMBROIDERY_FEE, embroideryFee, garmentMethod, methodLabel } from "../../../shared/decoration";
import { formatAUD } from "../../../shared/catalogue";
import { GarmentStage } from "../garment-stage";
import { SpotPicker } from "../studio/logo-controls";

/** One garment in the kit: a product + colour, with every size of it. */
export interface KitGarmentView {
  key: string;
  product: Product;
  colour: GarmentColour;
  sizes: { size: string; quantity: number }[];
  pieces: number;
  /** Display name — the option name when every row of this garment is the same option. */
  name: string;
}

export interface GarmentPlacementState {
  front: LogoTransform;
  back: LogoTransform;
  /** How this placement got here — shown in the garment list. */
  status: "default" | "edited" | "copied";
}

export const garmentKey = (slug: string, colourId: string) => `${slug}|${colourId}`;

/** Starting point for a garment: Left Chest (or the cap Front Panel), no back logo. */
export function defaultGarmentPlacement(product: Product, colour: GarmentColour): GarmentPlacementState {
  return {
    front: defaultTransform("front", product, colour),
    back: { ...defaultTransform("back", product, colour), enabled: false },
    status: "default",
  };
}

export function placementFor(
  g: KitGarmentView,
  placements: Record<string, GarmentPlacementState>,
): GarmentPlacementState {
  return placements[g.key] ?? defaultGarmentPlacement(g.product, g.colour);
}

/** The logos a garment will actually be produced with (back only where the garment takes one). */
export function liveViews(g: KitGarmentView, s: GarmentPlacementState) {
  return {
    front: s.front.enabled ? s.front : null,
    back: backSupported(g.product, g.colour) && s.back.enabled ? s.back : null,
  };
}

/**
 * Embroidery fee across the kit: A$16 × pieces for every garment group with at least
 * one embroidered view; printed garments add nothing. Display only — the order API
 * recomputes it from the same stored methods.
 */
export function kitEmbroidery(garments: KitGarmentView[], placements: Record<string, GarmentPlacementState>) {
  let fee = 0;
  let pieces = 0;
  for (const g of garments) {
    const v = liveViews(g, placementFor(g, placements));
    const f = embroideryFee(g.pieces, v.front, v.back);
    if (f > 0) {
      fee += f;
      pieces += g.pieces;
    }
  }
  return { fee, pieces };
}

/** Sets one method on every logo in the kit ("embroider everything" / "print everything"). */
export function applyMethodToAll(
  garments: KitGarmentView[],
  placements: Record<string, GarmentPlacementState>,
  method: DecorationMethod,
): Record<string, GarmentPlacementState> {
  const next = { ...placements };
  for (const g of garments) {
    const s = placementFor(g, placements);
    next[g.key] = { front: { ...s.front, method }, back: { ...s.back, method }, status: s.status === "default" ? "copied" : s.status };
  }
  return next;
}

export interface ApplyResult {
  next: Record<string, GarmentPlacementState>;
  updated: number;
  skipped: string[];
}

/**
 * "Apply these spots to all compatible garments": copies the source garment's front
 * and back spot onto every other garment by spot id, view by view, only where that
 * garment offers the same spot (see transferPlacement). Others keep their own setup.
 */
export function applyToAll(
  garments: KitGarmentView[],
  placements: Record<string, GarmentPlacementState>,
  fromKey: string,
): ApplyResult {
  const src = garments.find((g) => g.key === fromKey);
  if (!src) return { next: placements, updated: 0, skipped: [] };
  const srcState = placementFor(src, placements);
  const next = { ...placements, [src.key]: srcState };
  const skipped: string[] = [];
  let updated = 0;

  for (const g of garments) {
    if (g.key === src.key) continue;
    const current = placementFor(g, placements);
    const result: GarmentPlacementState = { ...current };
    let changed = false;
    for (const view of ["front", "back"] as const) {
      const srcT = view === "front" ? srcState.front : srcState.back;
      // Nothing to copy for a back view the source garment doesn't have.
      if (view === "back" && !backSupported(src.product, src.colour)) continue;
      const r = transferPlacement(src, g, view, srcT, view === "front" ? current.front : current.back);
      if (r.ok) {
        result[view] = r.transform;
        changed = true;
      } else if (srcT.enabled) {
        skipped.push(`${g.name} ${g.colour.name} ${view} (${r.reason})`);
      }
    }
    if (changed) {
      result.status = "copied";
      updated += 1;
    }
    next[g.key] = result;
  }
  return { next, updated, skipped };
}

interface KitPlacementStageProps {
  garments: KitGarmentView[];
  placements: Record<string, GarmentPlacementState>;
  onPlacements: (next: Record<string, GarmentPlacementState>) => void;
  selectedKey: string;
  onSelect: (key: string) => void;
  logo: { url: string; name: string };
  onBackToKit: () => void;
  onReview: () => void;
}

/**
 * Per-garment logo placement for a bundle kit. Each garment (product + colour)
 * keeps its own front and back placement; the customer can copy one garment's
 * placement to the rest, or step through them one at a time.
 */
export function KitPlacementStage({
  garments,
  placements,
  onPlacements,
  selectedKey,
  onSelect,
  logo,
  onBackToKit,
  onReview,
}: KitPlacementStageProps) {
  const [view, setView] = useState<GarmentView>("front");
  const [individual, setIndividual] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "info"; text: string } | null>(null);

  const index = Math.max(
    0,
    garments.findIndex((g) => g.key === selectedKey),
  );
  const garment = garments[index];
  const state = placementFor(garment, placements);
  const hasBack = backSupported(garment.product, garment.colour);
  const backPhoto = hasBackPhoto(garment.colour);
  const activeView: GarmentView = view === "back" && hasBack ? "back" : "front";
  const active = activeView === "front" ? state.front : state.back;
  const spots = viewSpots(garment.product, garment.colour, activeView);

  const write = (patch: Partial<GarmentPlacementState>) =>
    onPlacements({ ...placements, [garment.key]: { ...state, ...patch, status: "edited" } });

  /** Picks a fixed spot for one view of this garment (null = no logo there). */
  const selectSpot = (v: GarmentView, id: PlacementId | null) => {
    const prev = v === "front" ? state.front : state.back;
    const placed =
      (id ? spotLogo(garment.product, garment.colour, id) : null) ?? {
        ...defaultTransform(v, garment.product, garment.colour),
        enabled: false,
      };
    // Moving to another spot keeps the chosen print/embroidery method.
    const t = prev.method ? { ...placed, method: prev.method } : placed;
    write(v === "front" ? { front: t } : { back: t });
    setView(v);
  };

  const selectMethod = (v: GarmentView, method: DecorationMethod) => {
    write(v === "front" ? { front: { ...state.front, method } } : { back: { ...state.back, method } });
  };

  const methodAll = (method: DecorationMethod) => {
    onPlacements(applyMethodToAll(garments, placements, method));
    setMessage({
      tone: "ok",
      text:
        method === "embroidery"
          ? `Every logo in the kit is now embroidered — +${formatAUD(EMBROIDERY_FEE)} per garment. Select a garment to switch any back to print.`
          : "Every logo in the kit is now printed. Select a garment to embroider it instead.",
    });
  };

  const live = liveViews(garment, state);
  const garmentFee = embroideryFee(garment.pieces, live.front, live.back);
  const totals = kitEmbroidery(garments, placements);

  const select = (key: string) => {
    onSelect(key);
    setView("front");
  };

  const applyAll = () => {
    const r = applyToAll(garments, placements, garment.key);
    onPlacements(r.next);
    setIndividual(false);
    const base =
      r.updated === 0
        ? "No other garments to copy to."
        : `Copied the ${garment.name} (${garment.colour.name}) spots to ${r.updated} other ${
            r.updated === 1 ? "garment" : "garments"
          }. Select any garment to change it.`;
    setMessage({
      tone: r.skipped.length ? "info" : "ok",
      text: r.skipped.length
        ? `${base} Not copied where that spot doesn't exist — those keep their own setup: ${r.skipped.join("; ")}.`
        : base,
    });
  };

  const editIndividually = () => {
    setIndividual(true);
    setMessage(null);
    select(garments[0].key);
  };

  const isLast = index === garments.length - 1;

  return (
    <div>
      {/* Garment list */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-display text-[1.05rem] font-bold text-tf-ink">
            Garments in your kit · {garments.length}
          </h3>
          <p className="mt-1 text-[0.84rem] text-tf-steel">
            Select a garment to choose its logo spots. Every size of a garment shares them.
          </p>
        </div>
        <p className="flex items-center gap-2 text-[0.8rem] text-tf-steel">
          <span className="tf-checker grid size-8 place-items-center border border-tf-line">
            <img src={logo.url} alt="" className="max-h-6 max-w-6 object-contain" />
          </span>
          <span className="max-w-[14rem] truncate font-semibold text-tf-ink">{logo.name}</span>
          <button type="button" className="font-semibold text-tf-navy underline" onClick={onBackToKit}>
            Change
          </button>
        </p>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6" aria-label="Garments in your kit">
        {garments.map((g, i) => {
          const s = placementFor(g, placements);
          const selected = g.key === garment.key;
          return (
            <li key={g.key}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${g.name}, ${g.colour.name}, ${g.pieces} ${g.pieces === 1 ? "piece" : "pieces"} — ${
                  s.status === "default" ? "default spots" : s.status === "edited" ? "edited" : "copied spots"
                }`}
                onClick={() => select(g.key)}
                className={cn(
                  "flex h-full w-full flex-col border bg-white text-left transition-colors",
                  selected ? "border-tf-navy ring-1 ring-tf-navy" : "border-tf-line hover:border-tf-navy",
                )}
              >
                <span className="tf-stage relative block">
                  <GarmentStage
                    colour={g.colour}
                    view="front"
                    logoUrl={logo.url}
                    transform={s.front}
                    alt=""
                  />
                  <span className="absolute top-0 left-0 bg-tf-navy-deep px-1.5 py-0.5 font-display text-[0.62rem] font-bold text-white">
                    {i + 1}
                  </span>
                  {s.front.enabled ? (
                    <span className="absolute bottom-0 left-0 max-w-full truncate bg-white/90 px-1.5 py-0.5 font-display text-[0.58rem] font-bold tracking-[0.06em] text-tf-navy uppercase">
                      {spotLabel(s.front)}
                    </span>
                  ) : null}
                  {s.back.enabled && backSupported(g.product, g.colour) ? (
                    <span className="absolute top-0 right-0 bg-tf-yellow px-1.5 py-0.5 font-display text-[0.6rem] font-bold text-tf-navy-deep">
                      + back
                    </span>
                  ) : null}
                </span>
                {(() => {
                  const lv = liveViews(g, s);
                  const m = garmentMethod(lv.front, lv.back);
                  return m ? (
                    <span
                      data-testid="kit-tile-method"
                      className={cn(
                        "block px-2.5 pt-1.5 font-display text-[0.62rem] font-bold tracking-[0.08em] uppercase",
                        m === "print" ? "text-tf-steel" : "text-tf-rust",
                      )}
                    >
                      {methodLabel(m)}
                    </span>
                  ) : null;
                })()}
                <span className="block border-t border-tf-line px-2.5 py-2">
                  <span className="block truncate font-display text-[0.8rem] font-bold text-tf-ink">
                    {g.name}
                  </span>
                  <span className="block truncate text-[0.72rem] text-tf-steel">
                    {g.colour.name} · {g.pieces} pcs
                  </span>
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 text-[0.68rem] font-semibold",
                      s.status === "default" ? "text-tf-steel" : "text-tf-navy",
                    )}
                  >
                    {s.status === "default" ? null : <Check className="size-3" aria-hidden />}
                    {s.status === "default" ? "Default spots" : s.status === "edited" ? "Edited" : "Copied"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* How to set them */}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="btn-base btn-secondary max-w-full !py-2.5 !text-[0.82rem] !whitespace-normal text-tf-navy hover:text-tf-navy" onClick={applyAll}>
          <Copy className="size-4 shrink-0" aria-hidden /> <span>Apply these spots to all compatible garments</span>
        </button>
        <button
          type="button"
          aria-pressed={individual}
          className={cn(
            "btn-base max-w-full !py-2.5 !text-[0.82rem] !whitespace-normal",
            individual ? "btn-primary" : "btn-secondary text-tf-navy hover:text-tf-navy",
          )}
          onClick={editIndividually}
        >
          <ListChecks className="size-4 shrink-0" aria-hidden /> <span>Edit each garment individually</span>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.8rem]" data-testid="kit-method-all">
        <span className="font-semibold text-tf-ink">Decoration for every garment:</span>
        <button type="button" className="tf-chip" onClick={() => methodAll("print")}>
          Print all
        </button>
        <button type="button" className="tf-chip" onClick={() => methodAll("embroidery")}>
          Embroider all (+{formatAUD(EMBROIDERY_FEE)} per garment)
        </button>
        <span className="text-tf-steel" data-testid="kit-embroidery-total">
          {totals.fee
            ? `Embroidery: ${totals.pieces} ${totals.pieces === 1 ? "garment" : "garments"} × ${formatAUD(EMBROIDERY_FEE)} = +${formatAUD(totals.fee)}`
            : "All printed — no embroidery fee."}
        </span>
      </div>
      {message ? (
        <output
          className="mt-3 flex items-start gap-2 border border-tf-navy/25 bg-white px-4 py-3 text-[0.84rem] leading-snug text-tf-ink"
        >
          {message.tone === "ok" ? (
            <Check className="mt-0.5 size-4 shrink-0 text-tf-navy" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-tf-navy" aria-hidden />
          )}
          {message.text}
        </output>
      ) : null}

      {/* Editor */}
      <div className="mt-6 grid gap-6 border border-tf-line bg-white p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
        <div className="min-w-0">
          <div className="tf-stage relative mx-auto w-full max-w-[min(100%,52vh)] border border-tf-line">
            <GarmentStage
              colour={garment.colour}
              view={activeView}
              silhouette={garment.product.silhouette}
              logoUrl={logo.url}
              transform={active.enabled ? active : null}
              spots={spots}
              selectedSpot={active.enabled ? active.placementId : null}
              onSpotSelect={(id) => selectSpot(activeView, id)}
              alt={`${garment.name} in ${garment.colour.name}, ${activeView} view, with your logo`}
            />
            <span className="pointer-events-none absolute top-2 left-2 bg-tf-navy-deep/90 px-2 py-1 font-display text-[0.6rem] font-bold tracking-[0.14em] text-white uppercase">
              {activeView} view
            </span>
            {(activeView === "front" || backPhoto) &&
            (activeView === "front" ? garment.colour.source : garment.colour.backSource ?? garment.colour.source) ===
              "tint" ? (
              <span className="pointer-events-none absolute top-2 right-2 bg-tf-cta px-2 py-1 font-display text-[0.6rem] font-bold tracking-[0.14em] text-white uppercase">
                Rendered preview
              </span>
            ) : null}
            {active.enabled && active.placementId ? (
              <span className="pointer-events-none absolute right-2 bottom-2 bg-tf-yellow px-2 py-1 font-display text-[0.62rem] font-bold tracking-[0.12em] text-tf-navy-deep uppercase">
                {spotLabel(active)}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <fieldset className="m-0 flex gap-2 border-0 p-0">
              <legend className="sr-only">Garment view</legend>
              <button type="button" className="tf-chip" aria-pressed={activeView === "front"} onClick={() => setView("front")}>
                Front
              </button>
              <button
                type="button"
                className="tf-chip"
                aria-pressed={activeView === "back"}
                disabled={!hasBack}
                onClick={() => setView("back")}
                title={hasBack ? undefined : `The ${garment.name} takes a front logo only`}
              >
                Back
              </button>
            </fieldset>
            <p className="text-[0.74rem] font-semibold text-tf-steel">
              {garment.sizes.map((s) => `${s.size} × ${s.quantity}`).join(" · ")}
            </p>
          </div>
          {!hasBack ? (
            <p className="mt-2 flex items-start gap-2 text-[0.78rem] leading-snug text-tf-steel">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The {garment.name} takes a front logo only.
            </p>
          ) : !backPhoto ? (
            <p className="mt-2 flex items-start gap-2 text-[0.78rem] leading-snug text-tf-steel">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              No back photo for the {garment.colour.name} {garment.name} yet — the back is an
              outline diagram. The Standard Back is still available.
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          {individual ? (
            <p className="font-display text-[0.78rem] font-bold text-tf-navy">
              Garment {index + 1} of {garments.length}
            </p>
          ) : null}
          <h3 className="tf-display text-[1.3rem] text-tf-ink">
            {garment.name} · {garment.colour.name}
          </h3>
          <dl className="mt-3 space-y-1 text-[0.8rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-tf-steel">Front</dt>
              <dd className="text-right font-semibold text-tf-ink">
                {describePlacement(garment.product, garment.colour, "front", state.front)}
                {live.front ? ` · ${methodLabel(garmentMethod(live.front, null))}` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tf-steel">Back</dt>
              <dd className="text-right font-semibold text-tf-ink">
                {hasBack ? describePlacement(garment.product, garment.colour, "back", state.back) : "Front logo only"}
                {live.back ? ` · ${methodLabel(garmentMethod(null, live.back))}` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4" data-testid="kit-garment-fee">
              <dt className="text-tf-steel">Embroidery</dt>
              <dd className="text-right font-semibold text-tf-ink">
                {garmentFee
                  ? `${garment.pieces} × ${formatAUD(EMBROIDERY_FEE)} = +${formatAUD(garmentFee)}`
                  : "None (printed)"}
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-tf-line pt-4">
            <SpotPicker
              product={garment.product}
              colour={garment.colour}
              front={state.front}
              back={state.back}
              onSelect={selectSpot}
              onFocusView={setView}
              onMethod={selectMethod}
              idPrefix={`kit-${garment.key}`}
            />
          </div>

          {individual ? (
            <div className="mt-6 flex gap-2 border-t border-tf-line pt-5">
              <button
                type="button"
                className="btn-base btn-secondary flex-1 !py-2.5 !text-[0.82rem] text-tf-navy hover:text-tf-navy"
                disabled={index === 0}
                onClick={() => select(garments[index - 1].key)}
              >
                <ArrowLeft className="size-4" aria-hidden /> <span>Previous</span>
              </button>
              <button
                type="button"
                className="btn-base btn-primary flex-1 !py-2.5 !text-[0.82rem]"
                onClick={() => (isLast ? onReview() : select(garments[index + 1].key))}
              >
                {isLast ? "Review bundle" : "Next garment"} <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn-base btn-secondary text-tf-navy hover:text-tf-navy" onClick={onBackToKit}>
          <ArrowLeft className="size-4" aria-hidden /> <span>Back to kit</span>
        </button>
        <button type="button" className="btn-base btn-primary" onClick={onReview}>
          Review bundle <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
