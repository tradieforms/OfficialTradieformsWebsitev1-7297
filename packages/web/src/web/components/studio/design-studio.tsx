import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  FilePlus2,
  Info,
  Loader2,
  Pencil,
  Save,
  ShoppingCart,
  Store,
} from "lucide-react";
import {
  type GarmentColour,
  type PlacementId,
  type Product,
  type ProductVariant,
  familyOf,
  formatAUD,
  fromPrice,
  getVariant,
  offeredColour,
  variantColours,
  variantDisplayName,
} from "../../../shared/catalogue";
import { offersBack } from "../../../shared/placements";
import { GarmentStage } from "../garment-stage";
import { LogoUploader, SpotPicker } from "./logo-controls";
import { type LogoState, RemoveBackground } from "./remove-background";
import {
  type GarmentView,
  defaultTransform,
  describePlacement,
  fitLogo,
  hasView,
  resolveView,
  spotLabel,
  spotLogo,
  viewSpots,
} from "../../lib/garment";
import { setStudioUrl } from "../../lib/studio-url";
import { type LogoTransform, useCart } from "../../lib/cart";
import type { RestoredDesign } from "../../lib/design";
import type { LogoAnalysis } from "../../lib/logo-file";
import { saveDraft } from "../../lib/drafts";
import { useLogoUpload } from "../../queries/upload";
import { useSaveDesign, useUpdateDesign } from "../../queries/designs";
import { authClient } from "../../lib/auth";
import { cn } from "../../lib/utils";
import { type DecorationMethod, EMBROIDERY_FEE, embroideryFee, methodLabel, viewMethod } from "../../../shared/decoration";

const PLACEHOLDER_LOGO = "/images/brand/logo-placeholder.svg";

type StepId = "product" | "garment" | "logo" | "placement" | "review" | "next";

const STEPS: { id: StepId; label: string }[] = [
  { id: "product", label: "Product" },
  { id: "garment", label: "Colour & size" },
  { id: "logo", label: "Logo" },
  { id: "placement", label: "Logo spots" },
  { id: "review", label: "Review & save" },
  { id: "next", label: "Next steps" },
];

interface DesignStudioProps {
  products: Product[];
  initialProductSlug?: string | null;
  initialColourId?: string | null;
  initialVariantId?: string | null;
  restored?: RestoredDesign | null;
}

type Logo = LogoState;

type Saved = { kind: "account"; id: number } | { kind: "draft"; id: string } | null;

function defaultSize(product: Product) {
  return product.sizes.includes("L") ? "L" : product.sizes[Math.min(2, product.sizes.length - 1)];
}

function initialTransforms(product: Product, colour: GarmentColour) {
  return {
    front: defaultTransform("front", product, colour),
    back: { ...defaultTransform("back", product, colour), enabled: false },
  };
}

/**
 * Carries a logo across a product or colour change by its fixed spot: the same spot on
 * the new garment if it has one, otherwise that garment's default spot for the view.
 */
function refit(product: Product, colour: GarmentColour, view: GarmentView, prev: LogoTransform): LogoTransform {
  const off = { ...defaultTransform(view, product, colour), enabled: false };
  if (!prev.enabled || (view === "back" && !offersBack(product))) return off;
  const same = prev.placementId ? spotLogo(product, colour, prev.placementId) : null;
  const next = same ?? defaultTransform(view, product, colour);
  return prev.method ? { ...next, method: prev.method } : next;
}

/** Restores a saved logo; older free-positioned ones snap to the nearest fixed spot. */
function restoreLogo(
  product: Product | null,
  colour: GarmentColour | null,
  view: GarmentView,
  t: LogoTransform | null | undefined,
): LogoTransform | null {
  if (!t) return null;
  if (!product || !colour) return t;
  return fitLogo(product, colour, view, t);
}

/**
 * The Design Studio: product → colour & size → logo → placement → review &
 * save → next steps. No payment details are asked for at any point; saving is
 * either to the signed-in account (server) or a guest draft in this browser.
 */
export function DesignStudio({
  products,
  initialProductSlug,
  initialColourId,
  initialVariantId,
  restored,
}: DesignStudioProps) {
  const cart = useCart();
  const upload = useLogoUpload();
  const saveDesign = useSaveDesign();
  const updateDesign = useUpdateDesign();
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  const startProduct =
    products.find((p) => p.slug === (restored?.productSlug ?? initialProductSlug)) ?? null;
  const startVariantId = startProduct
    ? (getVariant(startProduct, restored ? restored.variantId : initialVariantId)?.id ?? startProduct.defaultVariant)
    : null;
  // Only colours made in the starting fabric option (a saved black 100% cotton polo, say,
  // opens in the first colour that fabric is made in).
  const startColour = startProduct
    ? offeredColour(startProduct, startVariantId, restored?.colourId ?? initialColourId)
    : null;
  const startTransforms = startProduct && startColour ? initialTransforms(startProduct, startColour) : null;
  const restoredFront = restoreLogo(startProduct, startColour, "front", restored?.frontLogo);
  const restoredBack = restoreLogo(startProduct, startColour, "back", restored?.backLogo);

  const [slug, setSlug] = useState<string | null>(startProduct?.slug ?? null);
  const [colourId, setColourId] = useState<string | null>(startColour?.id ?? null);
  const [variantId, setVariantId] = useState<string | null>(startVariantId);
  const [colourNotice, setColourNotice] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(
    restored?.size ?? (startProduct ? defaultSize(startProduct) : null),
  );
  const [step, setStep] = useState<StepId>(
    restored ? "placement" : startProduct ? "garment" : "product",
  );
  const [view, setView] = useState<GarmentView>(
    restored?.view === "back" && startProduct && offersBack(startProduct) ? "back" : "front",
  );
  const [logo, setLogo] = useState<Logo | null>(
    restored?.logoKey && restored.logoUrl
      ? { key: restored.logoKey, url: restored.logoUrl, name: restored.logoName ?? "Saved logo" }
      : null,
  );
  const [analysis, setAnalysis] = useState<LogoAnalysis | null>(null);
  const [frontLogo, setFrontLogo] = useState<LogoTransform>(
    restoredFront ?? startTransforms?.front ?? defaultTransform("front"),
  );
  const [backLogo, setBackLogo] = useState<LogoTransform>(
    restoredBack ?? startTransforms?.back ?? { ...defaultTransform("back"), enabled: false },
  );
  const [designName, setDesignName] = useState(
    restored?.designName ?? (startProduct ? `${startProduct.name} design` : "My design"),
  );
  const [quantity, setQuantity] = useState(1);
  const [saved, setSaved] = useState<Saved>(
    restored?.designId != null
      ? { kind: "account", id: restored.designId }
      : restored?.draftId
        ? { kind: "draft", id: restored.draftId }
        : null,
  );
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  // Saved before fixed spots existed: tell the customer where their logo was moved to.
  const [migratedNotice, setMigratedNotice] = useState<string | null>(() => {
    const moved = [
      restoredFront?.migrated && restoredFront.enabled ? `front → ${spotLabel(restoredFront)}` : null,
      restoredBack?.migrated && restoredBack.enabled ? `back → ${spotLabel(restoredBack)}` : null,
    ].filter(Boolean);
    return moved.length ? moved.join(", ") : null;
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const product = products.find((p) => p.slug === slug) ?? null;
  const variant = product ? (getVariant(product, variantId) ?? getVariant(product)!) : null;
  /** Colours made in the chosen fabric option — the only ones offered. */
  const colourChoices = product ? variantColours(product, variant?.id) : [];
  const colour = product ? offeredColour(product, variant?.id, colourId) : null;
  const unitPrice = variant?.price ?? product?.price ?? 0;
  const garmentLabel = product && variant ? variantDisplayName(product, variant) : (product?.name ?? "");
  const family = product ? familyOf(product) : [];
  const backAvailable = product ? offersBack(product) : false;
  const backPhoto = colour ? hasView(colour, "back") : false;
  const activeView: GarmentView = view === "back" && backAvailable ? "back" : "front";
  // Logos that will actually be produced — decides the embroidery fee shown here.
  // The server recomputes the fee from the same methods; this is display only.
  const liveFront = logo && frontLogo.enabled ? frontLogo : null;
  const liveBack = logo && backAvailable && backLogo.enabled ? backLogo : null;
  const unitFee = embroideryFee(1, liveFront, liveBack);
  const unitTotal = unitPrice + unitFee;
  const active = activeView === "front" ? frontLogo : backLogo;
  const spots = useMemo(
    () => (product && colour ? viewSpots(product, colour, activeView) : []),
    [product, colour, activeView],
  );
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  // Mark edits after a save so the "saved" confirmation never goes stale.
  const touch = () => {
    setSavedMessage(null);
  };

  /** Picks a fixed spot for a view (null = no logo there). The only way to place a logo. */
  const selectSpot = (v: GarmentView, id: PlacementId | null) => {
    if (!product || !colour) return;
    touch();
    setMigratedNotice(null);
    const placed = id ? spotLogo(product, colour, id) : null;
    // Keep the chosen print/embroidery method when moving between spots.
    (v === "front" ? setFrontLogo : setBackLogo)((prev) =>
      placed
        ? prev.method
          ? { ...placed, method: prev.method }
          : placed
        : { ...defaultTransform(v, product, colour), enabled: false, method: prev.method },
    );
    setView(v);
  };

  const selectMethod = (v: GarmentView, method: DecorationMethod) => {
    touch();
    (v === "front" ? setFrontLogo : setBackLogo)((prev) => ({ ...prev, method }));
  };

  const goTo = (id: StepId) => {
    setStep(id);
    // Keep the active step in view on small screens.
    window.requestAnimationFrame(() => {
      const top = panelRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0 || top > window.innerHeight * 0.6) {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

  const canEnter = (id: StepId) => {
    if (id === "product") return true;
    if (!product) return false;
    return true;
  };

  const chooseProduct = (p: Product) => {
    touch();
    const nextColour = offeredColour(p, p.defaultVariant, colour?.id);
    setColourNotice(null);
    setSlug(p.slug);
    setVariantId(p.defaultVariant);
    setColourId(nextColour.id);
    setSize((s) => (s && p.sizes.includes(s) ? s : defaultSize(p)));
    setFrontLogo((prev) => refit(p, nextColour, "front", prev));
    setBackLogo((prev) => refit(p, nextColour, "back", prev));
    setView("front");
    if (!product || designName === `${product.name} design`) setDesignName(`${p.name} design`);
  };

  /** Colour change keeps the chosen spots, re-fitted to the new colour's photo. */
  const chooseColour = (c: GarmentColour) => {
    if (!product || !colour) return;
    touch();
    setColourNotice(null);
    setFrontLogo((t) => refit(product, c, "front", t));
    setBackLogo((t) => refit(product, c, "back", t));
    setColourId(c.id);
  };

  /**
   * Fabric option change. Options can be made in different colours (black polo = stretch
   * cotton only), so a colour the new fabric isn't made in moves to one it is — and says so.
   */
  const chooseVariant = (v: ProductVariant) => {
    if (!product || !colour) return;
    touch();
    setVariantId(v.id);
    const next = offeredColour(product, v.id, colour.id);
    if (next.id !== colour.id) {
      setFrontLogo((t) => refit(product, next, "front", t));
      setBackLogo((t) => refit(product, next, "back", t));
      setColourId(next.id);
      setColourNotice(`${colour.name} isn't made in ${v.label.toLowerCase()} — switched to ${next.name}.`);
    } else {
      setColourNotice(null);
    }
  };

  /** Background removed (or undone): swap the file, keep every placement as it is. */
  const replaceLogo = (next: LogoState) => {
    touch();
    setLogo(next);
    setAnalysis(next.analysis ?? null);
  };

  const onUpload = (file: File) => {
    upload.mutate(file, {
      onSuccess: (result) => {
        touch();
        setLogo({ key: result.key, url: result.url, name: result.name, file: result.file, analysis: result.analysis });
        setAnalysis(result.analysis);
        setFrontLogo((t) => (t.enabled || backLogo.enabled ? t : { ...t, enabled: true }));
      },
    });
  };

  const placementLabel = (v: GarmentView, t: LogoTransform) => {
    if (!product || !colour) return "None";
    const where = describePlacement(product, colour, v, t);
    const m = viewMethod(t);
    return m ? `${where} · ${methodLabel(m)}` : where;
  };

  const payload = () => ({
    name: designName.trim() || `${product?.name ?? "Garment"} design`,
    productSlug: product!.slug,
    variantId: variant?.id ?? product!.defaultVariant,
    colourId: colour!.id,
    size: size ?? defaultSize(product!),
    logoKey: logo?.key ?? null,
    logoName: logo?.name ?? null,
    activeView,
    frontLogo,
    backLogo: backAvailable ? backLogo : { ...backLogo, enabled: false },
  });

  const onSaved = (s: NonNullable<Saved>, message: string) => {
    setSaved(s);
    setSaveError(null);
    setSavedMessage(message);
    setStudioUrl(s.kind === "account" ? { design: String(s.id) } : { draft: s.id });
    goTo("next");
  };

  const saveToAccount = (asNew = false) => {
    if (!product || !colour) return;
    const data = payload();
    const onError = (e: unknown) =>
      setSaveError(e instanceof Error ? e.message : "Couldn't save that design. Try again.");
    if (saved?.kind === "account" && !asNew) {
      updateDesign.mutate(
        { id: saved.id, ...data },
        {
          onSuccess: (row) => onSaved({ kind: "account", id: row.id }, "Design updated in your account."),
          onError,
        },
      );
    } else {
      saveDesign.mutate(data, {
        onSuccess: (row) => onSaved({ kind: "account", id: row.id }, "Design saved to your account."),
        onError,
      });
    }
  };

  const saveGuestDraft = () => {
    if (!product || !colour) return;
    const data = payload();
    const draft = saveDraft({
      id: saved?.kind === "draft" ? saved.id : undefined,
      name: data.name,
      productSlug: data.productSlug,
      variantId: data.variantId,
      colourId: data.colourId,
      size: data.size,
      view: data.activeView,
      logoKey: data.logoKey,
      logoName: data.logoName,
      frontLogo: data.frontLogo,
      backLogo: data.backLogo,
    });
    if (!draft) {
      setSaveError(
        "This browser blocked local storage (private mode or storage full), so the draft could not be saved. Sign in to save it to an account instead.",
      );
      return;
    }
    onSaved(
      { kind: "draft", id: draft.id },
      "Draft saved in this browser only. It isn't on our servers — clearing site data or switching device loses it.",
    );
  };

  const addToCart = () => {
    if (!product || !colour || !size) return;
    const front = logo && frontLogo.enabled ? frontLogo : null;
    const back = logo && backAvailable && backLogo.enabled ? backLogo : null;
    cart.addLine({
      kind: "product",
      slug: product.slug,
      label: `${garmentLabel} · ${colour.name} · ${size}`,
      variantId: variant?.id,
      colourId: colour.id,
      colourName: colour.name,
      size,
      quantity,
      unitPrice,
      image: colour.front,
      logoKey: front || back ? logo!.key : null,
      logoName: front || back ? logo!.name : null,
      logoUrl: front || back ? logo!.url : null,
      frontLogo: front,
      backLogo: back,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2600);
  };

  const startNew = () => {
    setSlug(null);
    setVariantId(null);
    setColourId(null);
    setSize(null);
    setLogo(null);
    setAnalysis(null);
    setFrontLogo(defaultTransform("front"));
    setBackLogo({ ...defaultTransform("back"), enabled: false });
    setDesignName("My design");
    setQuantity(1);
    setSaved(null);
    setSavedMessage(null);
    setView("front");
    setStudioUrl({});
    goTo("product");
  };

  // If the chosen colour has no back view, never sit on "back".
  useEffect(() => {
    if (view === "back" && !backAvailable) setView("front");
  }, [view, backAvailable]);

  const saving = saveDesign.isPending || updateDesign.isPending;
  const showOnStage = active.enabled && (Boolean(logo) || step === "placement");
  const resolved = colour ? resolveView(colour, activeView) : null;

  /* ------------------------------------------------------------------ */

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
      {/* ---------- Step indicator (full width) ---------- */}
      <nav aria-label="Design Studio steps" className="min-w-0 lg:col-span-2">
        <ol className="flex snap-x gap-1 overflow-x-auto border border-tf-line bg-white p-1 [scrollbar-width:thin]">
          {STEPS.map((s, i) => {
            const current = s.id === step;
            const done = i < stepIndex;
            const enabled = canEnter(s.id);
            return (
              <li key={s.id} className="min-w-[8.5rem] flex-1 snap-start">
                <button
                  type="button"
                  onClick={() => enabled && goTo(s.id)}
                  disabled={!enabled}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed",
                    current ? "bg-tf-navy text-white" : enabled ? "text-tf-ink hover:bg-tf-paper" : "text-tf-steel",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full font-display text-[0.7rem] font-bold",
                      current
                        ? "bg-tf-yellow text-tf-navy-deep"
                        : done && enabled
                          ? "bg-tf-navy text-white"
                          : "bg-tf-paper-dim text-tf-ink",
                    )}
                  >
                    {done && enabled ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className="font-display text-[0.78rem] leading-tight font-bold">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ---------- Garment preview ---------- */}
      {product && colour ? (
        <div
          className={cn(
            "min-w-0 lg:sticky lg:top-24 lg:self-start",
            step === "placement" && "sticky top-[4.25rem] z-20 lg:z-auto",
          )}
        >
          <div className="group/stage border border-tf-line bg-white shadow-[0_8px_24px_-18px_rgba(6,21,46,0.45)]">
            <div className="tf-stage relative mx-auto w-full max-w-[min(100%,42vh)] lg:max-w-none">
              <GarmentStage
                colour={colour}
                view={activeView}
                resolved={resolved}
                silhouette={product.silhouette}
                logoUrl={logo?.url ?? PLACEHOLDER_LOGO}
                transform={showOnStage ? active : null}
                spots={step === "placement" ? spots : undefined}
                selectedSpot={active.enabled ? active.placementId : null}
                onSpotSelect={step === "placement" ? (id) => selectSpot(activeView, id) : undefined}
                alt={`${product.name} in ${colour.name}, ${activeView} view${logo ? ", with your logo" : ""}`}
              />

              <span className="pointer-events-none absolute top-2 left-2 bg-tf-navy-deep/90 px-2 py-1 font-display text-[0.6rem] font-bold tracking-[0.14em] text-white uppercase">
                {activeView} view
              </span>
              {resolved?.source === "tint" ? (
                <span
                  className="pointer-events-none absolute top-2 right-2 bg-tf-cta px-2 py-1 font-display text-[0.6rem] font-bold tracking-[0.14em] text-white uppercase"
                  title={colour.note}
                >
                  Rendered preview
                </span>
              ) : null}
              {step === "placement" && !logo && active.enabled ? (
                <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1.5 bg-tf-navy-deep/90 px-2 py-1 text-[0.7rem] font-semibold text-white">
                  <Info className="size-3.5" aria-hidden /> Placeholder — upload your logo
                </span>
              ) : null}
              {step === "placement" && active.enabled && active.placementId ? (
                <span className="pointer-events-none absolute right-2 bottom-2 bg-tf-yellow px-2 py-1 font-display text-[0.62rem] font-bold tracking-[0.12em] text-tf-navy-deep uppercase">
                  {spotLabel(active)}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-tf-line px-3 py-2.5">
              <fieldset className="m-0 flex min-w-0 gap-2 border-0 p-0">
                <legend className="sr-only">Garment view</legend>
                <button
                  type="button"
                  className="tf-chip"
                  aria-pressed={activeView === "front"}
                  onClick={() => setView("front")}
                >
                  Front
                </button>
                <button
                  type="button"
                  className="tf-chip"
                  aria-pressed={activeView === "back"}
                  disabled={!backAvailable}
                  onClick={() => setView("back")}
                  title={backAvailable ? undefined : `The ${product.name} takes a front logo only`}
                >
                  Back
                </button>
              </fieldset>
              <p className="text-[0.72rem] font-semibold text-tf-steel">
                {garmentLabel} · {colour.name}
                {size ? ` · ${size}` : ""}
              </p>
            </div>
          </div>

          {!backAvailable ? (
            <p className="mt-2 flex items-start gap-2 text-[0.78rem] leading-snug text-tf-steel">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The {product.name} takes a front logo only.
            </p>
          ) : !backPhoto ? (
            <p className="mt-2 flex items-start gap-2 text-[0.78rem] leading-snug text-tf-steel">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              No back photo of the {product.name} in {colour.name} yet. The back view is an outline
              diagram, not a photo — the Standard Back is still available and printed the same way.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---------- Step panel ---------- */}
      <div
        ref={panelRef}
        className={cn("min-w-0 scroll-mt-24", !product && "lg:col-span-2")}
      >
        <div className="border border-tf-line bg-white">
          <div className="p-5 md:p-6">
            <p className="tf-eyebrow text-tf-steel">
              Step {stepIndex + 1} of {STEPS.length}
            </p>

            {/* Step 1 — product */}
            {step === "product" ? (
              <div className="mt-3">
                <h2 className="tf-display text-[1.45rem] text-tf-ink">Choose a garment</h2>
                <p className="mt-2 max-w-xl text-[0.92rem] leading-relaxed text-tf-steel">
                  Everything here is in the current range. No card details needed to design, save a
                  draft or ask for a quote.
                </p>
                <div
                  className={cn(
                    "mt-5 grid gap-3 sm:grid-cols-2",
                    product ? "xl:grid-cols-2" : "lg:grid-cols-4",
                  )}
                >
                  {products.map((p) => {
                    const selected = p.slug === slug;
                    const pc = p.colours.find((c) => c.id === p.defaultColour) ?? p.colours[0];
                    const hasBack = offersBack(p);
                    const from = fromPrice(p);
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          chooseProduct(p);
                          goTo("garment");
                        }}
                        className={cn(
                          "group flex flex-col border text-left transition-colors focus-visible:outline-none",
                          selected
                            ? "border-tf-navy ring-2 ring-tf-navy"
                            : "border-tf-line hover:border-tf-navy/60",
                        )}
                      >
                        <span className="tf-stage block aspect-square w-full">
                          <img
                            src={pc.front}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        </span>
                        <span className="block border-t border-tf-line p-3">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-display text-[0.95rem] font-bold text-tf-ink">{p.name}</span>
                            <span className="font-display text-[0.85rem] font-bold text-tf-navy">
                              {from.varies ? `From ${formatAUD(from.price)}` : formatAUD(from.price)}
                            </span>
                          </span>
                          <span className="mt-1 block text-[0.76rem] text-tf-steel">
                            {p.tagline} · {hasBack ? "Front & back" : "Front only"}
                          </span>
                          <span className="mt-2 flex gap-1.5" aria-label={`${p.colours.length} colours`}>
                            {p.colours.map((c) => (
                              <span
                                key={c.id}
                                title={c.name}
                                className="size-4 rounded-full border border-tf-steel/40"
                                style={{ background: c.hex }}
                              />
                            ))}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Step 2 — colour, size, view */}
            {step === "garment" && product && colour ? (
              <div className="mt-3">
                <h2 className="tf-display text-[1.45rem] text-tf-ink">Colour &amp; size</h2>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-tf-steel">
                  <span className="font-semibold text-tf-ink">Supplier photo</span> colours are real
                  product shots. <span className="font-semibold text-tf-rust">Rendered preview</span>{" "}
                  colours are the real photo re-shaded into that colour — fabric detail is genuine,
                  small trims may differ. Your logo and placement are kept when you switch.
                </p>
                {family.length > 1 || product.variants.length > 1 ? (
                  <fieldset data-style-picker className="m-0 mt-5 grid min-w-0 gap-2 border-0 p-0">
                    <legend className="tf-eyebrow mb-2 text-tf-steel">Style</legend>
                    {family.length > 1
                      ? family.map((fp) => {
                          const fv = getVariant(fp)!;
                          const selected = fp.slug === product.slug;
                          return (
                            <StyleOption
                              key={fp.slug}
                              name={fp.name}
                              material={fv.material}
                              fabricWeight={fv.fabricWeight}
                              price={fromPrice(fp)}
                              selected={selected}
                              onSelect={() => {
                                if (!selected) chooseProduct(fp);
                              }}
                            />
                          );
                        })
                      : product.variants.map((v) => (
                          <StyleOption
                            key={v.id}
                            name={v.name}
                            material={v.material}
                            fabricWeight={v.fabricWeight}
                            price={{ price: v.price, varies: false }}
                            colours={v.colours ? variantColours(product, v.id).map((c) => c.name) : undefined}
                            selected={v.id === variant?.id}
                            onSelect={() => chooseVariant(v)}
                          />
                        ))}
                  </fieldset>
                ) : variant?.material ? (
                  <p className="mt-4 text-[0.84rem] text-tf-steel">
                    <span className="font-semibold text-tf-ink">Material:</span> {variant.material}
                    {variant.fabricWeight ? ` · ${variant.fabricWeight}` : ""}
                  </p>
                ) : null}

                <fieldset className="m-0 mt-5 grid min-w-0 gap-2 border-0 p-0 sm:grid-cols-2">
                  <legend className="tf-eyebrow mb-2 text-tf-steel">Colour</legend>
                  {colourNotice ? (
                    <p data-colour-notice aria-live="polite" className="m-0 border-l-2 border-tf-orange bg-tf-paper px-3 py-2 text-[0.8rem] text-tf-ink sm:col-span-2">
                      {colourNotice}
                    </p>
                  ) : null}
                  {colourChoices.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      data-colour={c.id}
                      onClick={() => chooseColour(c)}
                      aria-pressed={c.id === colour.id}
                      className={cn(
                        "flex items-center gap-3 border px-3 py-2.5 text-left transition-colors",
                        c.id === colour.id
                          ? "border-tf-navy bg-tf-paper ring-1 ring-tf-navy"
                          : "border-tf-line hover:border-tf-navy/50",
                      )}
                    >
                      <span
                        className="size-7 shrink-0 rounded-full border border-tf-steel/40"
                        style={{ background: c.hex }}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block font-display text-[0.86rem] font-bold text-tf-ink">{c.name}</span>
                        <span
                          className={cn(
                            "block text-[0.7rem] font-semibold tracking-[0.06em] uppercase",
                            c.source === "supplier" ? "text-tf-steel" : "text-tf-rust",
                          )}
                        >
                          {c.source === "supplier" ? "Supplier photo" : "Rendered preview"}
                        </span>
                      </span>
                      {c.id === colour.id ? <Check className="ml-auto size-4 text-tf-navy" aria-hidden /> : null}
                    </button>
                  ))}
                </fieldset>

                <fieldset className="m-0 mt-6 min-w-0 border-0 border-t border-tf-line p-0 pt-5">
                  <legend className="sr-only">Size</legend>
                  <span className="tf-eyebrow block text-tf-steel">Size</span>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {product.sizes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="tf-chip min-w-11 justify-center"
                        aria-pressed={size === s}
                        onClick={() => {
                          touch();
                          setSize(s);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[0.78rem] leading-snug text-tf-steel">
                    Standard AU workwear sizing. Ordering for a crew? Sizes per person go in the{" "}
                    <Link to="/bundle-deals" className="font-semibold text-tf-navy underline">
                      bundle builder
                    </Link>
                    .
                  </p>
                </fieldset>
              </div>
            ) : null}

            {/* Step 3 — logo */}
            {step === "logo" ? (
              <div className="mt-3">
                <h2 className="tf-display text-[1.45rem] text-tf-ink">Upload your logo</h2>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-tf-steel">
                  The file is used exactly as you upload it. Transparent areas stay transparent — we
                  never add a white box or blend it into the fabric.
                </p>
                <div className="mt-5">
                  <LogoUploader
                    logoName={logo?.name}
                    logoUrl={logo?.url}
                    uploading={upload.isPending}
                    onUpload={onUpload}
                    onClear={() => {
                      touch();
                      setLogo(null);
                      setAnalysis(null);
                      upload.reset();
                    }}
                    analysis={analysis}
                    error={
                      upload.isError
                        ? upload.error instanceof Error
                          ? upload.error.message
                          : "Upload failed."
                        : null
                    }
                  />
                </div>
                {logo ? (
                  <RemoveBackground
                    logo={{ ...logo, analysis }}
                    onChange={replaceLogo}
                    className="mt-4 border border-tf-line bg-tf-paper px-3 py-3"
                    always
                  />
                ) : null}
                {restored?.logoMissing && !logo ? (
                  <p className="mt-4 flex items-start gap-2 border-l-2 border-tf-cta bg-tf-paper px-3 py-2 text-[0.84rem] text-tf-ink">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
                    The logo file for this saved design couldn&apos;t be loaded. Its placement is kept —
                    upload the logo again to see it.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Step 4 — placement */}
            {step === "placement" && product && colour ? (
              <div className="mt-3">
                <h2 className="tf-display text-[1.45rem] text-tf-ink">Choose your logo spots</h2>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-tf-steel">
                  Pick from the approved print spots for the {product.name}. Each one has a set size —
                  no dragging or resizing, so what you see is what production prints.
                </p>
                {migratedNotice ? (
                  <output
                    data-migrated-notice
                    className="mt-4 flex items-start gap-2 border-l-2 border-tf-cta bg-tf-paper px-3 py-2 text-[0.84rem] text-tf-ink"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
                    <span>
                      This design was saved before fixed logo spots. We moved your logo to the nearest
                      spot ({migratedNotice}). Check it, then save again.
                    </span>
                  </output>
                ) : null}
                <div className="mt-5">
                  <SpotPicker
                    product={product}
                    colour={colour}
                    front={frontLogo}
                    back={backLogo}
                    onSelect={selectSpot}
                    onFocusView={setView}
                    onMethod={selectMethod}
                  />
                </div>
                {logo ? (
                  <RemoveBackground
                    logo={{ ...logo, analysis }}
                    onChange={replaceLogo}
                    className="mt-5 border border-tf-line bg-tf-paper px-3 py-3"
                    always
                  />
                ) : null}
                {!logo ? (
                  <p className="mt-5 text-[0.82rem] text-tf-steel">
                    No logo yet —{" "}
                    <button type="button" className="font-semibold text-tf-navy underline" onClick={() => goTo("logo")}>
                      upload one
                    </button>{" "}
                    to see it on the garment.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Step 5 — review & save */}
            {step === "review" && product && colour ? (
              <div className="mt-3">
                <h2 className="tf-display text-[1.45rem] text-tf-ink">Review &amp; save</h2>
                <dl className="mt-4 divide-y divide-tf-line border-y border-tf-line text-[0.9rem]">
                  {(
                    [
                      ["Garment", garmentLabel],
                      ...(variant?.material ? [["Material", [variant.material, variant.fabricWeight].filter(Boolean).join(", ")]] : []),
                      ["Colour", `${colour.name}${colour.source === "tint" ? " (rendered preview)" : ""}`],
                      ["Size", size ?? "—"],
                      ["Logo", logo ? logo.name : "None — plain garment"],
                      ["Front", logo ? placementLabel("front", frontLogo) : "—"],
                      ...(backAvailable ? [["Back", logo ? placementLabel("back", backLogo) : "—"]] : []),
                      ...(unitFee
                        ? [
                            ["Garment price", formatAUD(unitPrice)],
                            ["Embroidery", `+${formatAUD(unitFee)} per garment`],
                            ["Unit price", formatAUD(unitTotal)],
                          ]
                        : [["Unit price", formatAUD(unitPrice)]]),
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-6 py-2.5">
                      <dt className="text-tf-steel">{label}</dt>
                      <dd className="max-w-[65%] text-right font-semibold break-words text-tf-ink">{value}</dd>
                    </div>
                  ))}
                </dl>

                <label htmlFor="design-name" className="tf-eyebrow mt-5 block text-tf-steel">
                  Design name
                </label>
                <input
                  id="design-name"
                  aria-label="Design name"
                  value={designName}
                  onChange={(e) => {
                    touch();
                    setDesignName(e.target.value);
                  }}
                  maxLength={80}
                  className="tf-input mt-2"
                  placeholder="e.g. Smithy's crew polos"
                />

                <div className="mt-5 flex flex-wrap gap-3">
                  {signedIn ? (
                    <>
                      <button
                        type="button"
                        className="btn-base btn-secondary text-tf-navy"
                        onClick={() => saveToAccount()}
                        disabled={saving}
                      >
                        {saving ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Save className="size-4" aria-hidden />
                        )}
                        {saved?.kind === "account" ? "Update saved design" : "Save to my account"}
                      </button>
                      {saved?.kind === "account" ? (
                        <button
                          type="button"
                          className="btn-base btn-secondary text-tf-navy"
                          onClick={() => saveToAccount(true)}
                          disabled={saving}
                        >
                          Save as a copy
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn-base btn-secondary text-tf-navy" onClick={saveGuestDraft}>
                        <Save className="size-4" aria-hidden />
                        {saved?.kind === "draft" ? "Update browser draft" : "Save draft in this browser"}
                      </button>
                      <Link
                        to={`/login?next=${encodeURIComponent(
                          saved?.kind === "draft" ? `/design-studio?draft=${saved.id}` : "/design-studio",
                        )}`}
                        className="btn-base btn-secondary text-tf-navy"
                      >
                        Sign in to save to an account
                      </Link>
                    </>
                  )}
                </div>
                <p className="mt-3 text-[0.8rem] leading-snug text-tf-steel">
                  {signedIn
                    ? "Account designs are stored on our servers and open from Account → Saved designs on any device."
                    : "A browser draft stays on this device only — nothing is sent to us. Sign in (free, no card) to keep designs across devices."}
                </p>
                {saveError ? (
                  <p role="alert" className="mt-3 text-[0.84rem] font-semibold text-tf-rust">
                    {saveError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Step 6 — next steps */}
            {step === "next" && product && colour ? (
              <div className="mt-3">
                {savedMessage ? (
                  <output
                    className="flex items-start gap-2 border border-tf-navy/20 bg-tf-paper px-3 py-2.5 text-[0.88rem] font-semibold text-tf-ink"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-tf-navy" aria-hidden />
                    <span>
                      {savedMessage}
                      {saved?.kind === "account" ? (
                        <>
                          {" "}
                          <Link to="/account" className="text-tf-navy underline">
                            View saved designs
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </output>
                ) : null}
                <h2 className="tf-display mt-4 text-[1.45rem] text-tf-ink">What next?</h2>

                <div className="mt-4 flex flex-wrap items-center gap-4 border-y border-tf-line py-4">
                  <span className="tf-eyebrow text-tf-steel">Qty</span>
                  <div className="flex items-center border border-tf-line">
                    <button
                      type="button"
                      className="px-3 py-2 text-lg leading-none text-tf-ink"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    >
                      −
                    </button>
                    <span className="min-w-10 border-x border-tf-line px-2 py-1.5 text-center font-display font-bold text-tf-ink">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      className="px-3 py-2 text-lg leading-none text-tf-ink"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity((q) => Math.min(999, q + 1))}
                    >
                      +
                    </button>
                  </div>
                  <span className="ml-auto font-display text-[1.4rem] font-extrabold text-tf-navy">
                    {formatAUD(unitTotal * quantity)}
                  </span>
                </div>
                <p className="mt-2 text-[0.8rem] text-tf-steel" data-testid="studio-price-breakdown">
                  {unitFee
                    ? `${formatAUD(unitPrice)} garment + ${formatAUD(EMBROIDERY_FEE)} embroidery = ${formatAUD(unitTotal)} each × ${quantity}.`
                    : `${formatAUD(unitPrice)} each × ${quantity}, printed.`}{" "}
                  Shipping is calculated at checkout from weight and postcode.
                </p>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button type="button" className="btn-base btn-primary sm:col-span-2" onClick={addToCart} disabled={added}>
                    {added ? <Check className="size-4" aria-hidden /> : <ShoppingCart className="size-4" aria-hidden />}
                    {added ? "Added to cart" : "Add to cart"}
                  </button>
                  <button type="button" className="btn-base btn-secondary text-tf-navy" onClick={() => goTo("placement")}>
                    <Pencil className="size-4" aria-hidden /> Continue editing
                  </button>
                  <button type="button" className="btn-base btn-secondary text-tf-navy" onClick={startNew}>
                    <FilePlus2 className="size-4" aria-hidden /> Start a new design
                  </button>
                  <Link to="/shop" className="btn-base btn-secondary text-tf-navy sm:col-span-2">
                    <Store className="size-4" aria-hidden /> Back to the catalogue
                  </Link>
                </div>
                {added ? (
                  <output className="block mt-3 text-[0.84rem] text-tf-ink">
                    Added. Nothing is charged until you check out —{" "}
                    <Link to="/cart" className="font-semibold text-tf-navy underline">
                      view cart
                    </Link>{" "}
                    or{" "}
                    <Link to="/checkout" className="font-semibold text-tf-navy underline">
                      go to checkout
                    </Link>
                    .
                  </output>
                ) : null}
                <p className="mt-4 text-[0.78rem] leading-snug text-tf-steel">
                  Nothing is ordered or paid until you check out.
                </p>
              </div>
            ) : null}
          </div>

          {/* Back / Continue */}
          {step !== "product" && step !== "next" ? (
            <div className="flex items-center justify-between gap-3 border-t border-tf-line px-5 py-4">
              <button
                type="button"
                className="btn-base btn-secondary text-tf-navy"
                onClick={() => goTo(STEPS[stepIndex - 1].id)}
              >
                <ArrowLeft className="size-4" aria-hidden /> Back
              </button>
              {step === "review" ? (
                <button
                  type="button"
                  className="btn-base btn-primary"
                  onClick={() => goTo("next")}
                  data-testid="studio-continue-checkout"
                >
                  Continue to Checkout <ArrowRight className="size-4" aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-base btn-primary"
                  onClick={() => goTo(STEPS[stepIndex + 1].id)}
                  disabled={step === "logo" && upload.isPending}
                >
                  {step === "logo" ? (logo ? "Continue to logo spots" : "Continue without a logo") : "Continue"}
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One radio-style option card in the studio's Style picker. */
function StyleOption({
  name,
  material,
  fabricWeight,
  price,
  colours,
  selected,
  onSelect,
}: {
  name: string;
  material: string;
  fabricWeight?: string;
  price: { price: number; varies: boolean };
  /** Colours this fabric option is made in, when it differs between options. */
  colours?: string[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 border px-3 py-2.5 text-left transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-tf-orange",
        selected ? "border-tf-navy bg-tf-paper ring-1 ring-tf-navy" : "border-tf-line hover:border-tf-navy/50",
      )}
    >
      <input
        type="radio"
        name="studio-style"
        className="sr-only"
        checked={selected}
        onChange={onSelect}
        aria-label={`${name}${material ? `, ${material}` : ""}, ${price.varies ? "from " : ""}${formatAUD(price.price)}`}
        data-style-option={name}
      />
      <span
        aria-hidden
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full border",
          selected ? "border-tf-navy" : "border-tf-steel/50",
        )}
      >
        {selected ? <span className="size-2 rounded-full bg-tf-navy" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[0.88rem] font-bold text-tf-ink">{name}</span>
        {material || fabricWeight ? (
          <span className="block text-[0.76rem] text-tf-steel">
            {[material, fabricWeight].filter(Boolean).join(" · ")}
          </span>
        ) : null}
        {colours?.length ? (
          <span data-style-colours className="mt-0.5 block text-[0.74rem] text-tf-steel">
            <span className="font-semibold text-tf-ink">Colours:</span> {colours.join(", ")}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-display text-[0.88rem] font-bold text-tf-navy">
        {price.varies ? `From ${formatAUD(price.price)}` : formatAUD(price.price)}
      </span>
    </label>
  );
}
