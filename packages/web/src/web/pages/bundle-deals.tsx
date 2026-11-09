import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Info,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  type Bundle,
  type Product,
  bundleTiers,
  formatAUD,
  fromPrice,
  garmentName,
  getVariant,
  offeredColour,
  priceKit,
  variantColours,
} from "../../shared/catalogue";
import { PageIntro } from "../components/layout";
import { Reveal } from "../components/reveal";
import { useCatalogue } from "../queries/catalogue";
import { useLogoUpload } from "../queries/upload";
import { type LogoState, RemoveBackground } from "../components/studio/remove-background";
import { type CartLine, type KitPlacement, useCart } from "../lib/cart";
import { backSupported, fitLogo } from "../lib/garment";
import { useSignedLogos } from "../lib/signed-logos";
import { cn } from "../lib/utils";
import {
  type GarmentPlacementState,
  type KitGarmentView,
  KitPlacementStage,
  garmentKey,
  kitEmbroidery,
  placementFor,
} from "../components/bundle/kit-placement";
import { EMBROIDERY_FEE } from "../../shared/decoration";
import { KitReviewStage } from "../components/bundle/kit-review";

interface BundleView extends Bundle {
  contents: string;
  fullPrice: number;
  saving: number;
  discountPercent: number;
}

interface KitRow {
  id: string;
  slug: string;
  variantId: string;
  colourId: string;
  size: string;
  quantity: number;
}

type Stage = "build" | "placement" | "review";

const STAGES: { id: Stage; label: string }[] = [
  { id: "build", label: "Build your kit" },
  { id: "placement", label: "Logo spots" },
  { id: "review", label: "Review" },
];

const MAX_QTY = 999;
let rowSeq = 0;
const nextId = () => `r${++rowSeq}`;

function defaultSize(product: Product) {
  return product.sizes.includes("M") ? "M" : product.sizes[0];
}

/** Same product + option + colour + size rows are combined before pricing / cart. */
function mergeRows(rows: KitRow[]) {
  const map = new Map<
    string,
    { slug: string; variantId: string; colourId: string; size: string; quantity: number }
  >();
  for (const r of rows) {
    if (r.quantity <= 0) continue;
    const k = `${r.slug}|${r.variantId}|${r.colourId}|${r.size}`;
    const cur = map.get(k);
    if (cur) cur.quantity += r.quantity;
    else
      map.set(k, {
        slug: r.slug,
        variantId: r.variantId,
        colourId: r.colourId,
        size: r.size,
        quantity: r.quantity,
      });
  }
  return [...map.values()];
}

export default function BundleDealsPage() {
  const search = useSearch();
  const catalogue = useCatalogue();
  const cart = useCart();
  const upload = useLogoUpload();

  const bundles = useMemo(() => (catalogue.data?.bundles ?? []) as BundleView[], [catalogue.data]);
  const products = useMemo(() => (catalogue.data?.products ?? []) as Product[], [catalogue.data]);
  const productBySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);

  const [rows, setRows] = useState<KitRow[]>([]);
  const [logo, setLogo] = useState<LogoState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("build");
  const [placements, setPlacements] = useState<Record<string, GarmentPlacementState>>({});
  const [selectedKey, setSelectedKey] = useState<string>("");
  /** Cart line being edited (from the cart's "Edit placements" link). */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const builderRef = useRef<HTMLDivElement>(null);
  const deepLinked = useRef(false);
  const editLoaded = useRef(false);
  const signed = useSignedLogos([logo?.key]);
  const logoUrl = logo ? (signed[logo.key] ?? logo.url) : null;

  const scrollToBuilder = () =>
    window.requestAnimationFrame(() =>
      builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );

  /* ---------------- Row editing ---------------- */

  const addProduct = (product: Product) => {
    const colourId = product.defaultColour;
    const size = defaultSize(product);
    const variantId = product.defaultVariant;
    setRows((prev) => {
      const same = prev.find(
        (r) => r.slug === product.slug && r.variantId === variantId && r.colourId === colourId && r.size === size,
      );
      if (same) return prev.map((r) => (r === same ? { ...r, quantity: Math.min(MAX_QTY, r.quantity + 1) } : r));
      return [...prev, { id: nextId(), slug: product.slug, variantId, colourId, size, quantity: 1 }];
    });
  };

  const patchRow = (id: string, patch: Partial<KitRow>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // Fabric options can be made in different colours (black polo = stretch cotton only):
        // a colour the new option isn't made in moves to one it is.
        const product = productBySlug.get(next.slug);
        if (product && patch.variantId) {
          const colour = offeredColour(product, next.variantId, next.colourId);
          if (colour.id !== next.colourId) {
            setNotice(
              `${product.colours.find((c) => c.id === next.colourId)?.name ?? "That colour"} isn't made in ${
                getVariant(product, next.variantId)?.label.toLowerCase() ?? "that option"
              } — switched to ${colour.name}.`,
            );
            next.colourId = colour.id;
          }
        }
        return next;
      }),
    );

  const setQty = (id: string, quantity: number) =>
    patchRow(id, { quantity: Math.max(1, Math.min(MAX_QTY, Math.round(quantity) || 1)) });

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  /** Optional starting point: a tier's example mix, fully editable. Replaces the current kit. */
  const loadExample = useCallback(
    (bundle: Bundle) => {
    const next: KitRow[] = [];
    for (const line of bundle.lines) {
      const product = productBySlug.get(line.slug);
      if (!product) continue;
      next.push({
        id: nextId(),
        slug: product.slug,
        variantId: product.defaultVariant,
        colourId: product.defaultColour,
        size: defaultSize(product),
        quantity: line.quantity,
      });
    }
    setRows(next);
    setNotice(
      `Loaded the ${bundle.tier} example mix (${bundle.pieces} pieces) as a starting point. Change, add or remove anything — the bundle rate follows your total piece count, not this mix.`,
    );
    window.requestAnimationFrame(() =>
      builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  },
    [productBySlug],
  );

  // Deep link from bundle cards: /bundle-deals?start=bundle-59 loads that example mix once.
  useEffect(() => {
    if (deepLinked.current || products.length === 0) return;
    const wanted = new URLSearchParams(search).get("start") ?? new URLSearchParams(search).get("bundle");
    const bundle = bundles.find((b) => b.id === wanted);
    if (!bundle) return;
    deepLinked.current = true;
    loadExample(bundle);
  }, [search, bundles, products, loadExample]);

  // Edit link from the cart: /bundle-deals?edit=<cart line id> reloads that kit,
  // its logo and every garment's placement. Saving replaces the cart line.
  useEffect(() => {
    if (editLoaded.current || products.length === 0) return;
    const id = new URLSearchParams(search).get("edit");
    if (!id) return;
    editLoaded.current = true;
    const line = cart.lines.find((l) => l.id === id && l.kind === "bundle");
    if (!line) {
      setNotice("That kit isn't in your cart any more, so there's nothing to edit. Build a new one below.");
      return;
    }
    const restored: KitRow[] = [];
    for (const e of line.sizes ?? []) {
      const product = productBySlug.get(e.slug);
      if (!product) continue;
      const variantId = getVariant(product, e.variantId)?.id ?? product.defaultVariant;
      const colourId = offeredColour(product, variantId, e.colourId).id;
      restored.push({ id: nextId(), slug: product.slug, variantId, colourId, size: e.size, quantity: e.quantity });
    }
    const restoredPlacements: Record<string, GarmentPlacementState> = {};
    for (const p of line.placements ?? []) {
      const product = productBySlug.get(p.slug);
      const colour = product?.colours.find((c) => c.id === p.colourId);
      if (!product || !colour) continue;
      const base = placementFor(
        { key: garmentKey(p.slug, p.colourId), product, colour, sizes: [], pieces: 0, name: product.name },
        {},
      );
      restoredPlacements[garmentKey(p.slug, p.colourId)] = {
        // Re-fit to the garment's fixed spots (older carts held free positions).
        front: p.frontLogo ? fitLogo(product, colour, "front", p.frontLogo) : { ...base.front, enabled: false },
        back: p.backLogo ? fitLogo(product, colour, "back", p.backLogo) : base.back,
        status: "edited",
      };
    }
    setRows(restored);
    setPlacements(restoredPlacements);
    setEditingId(line.id);
    if (line.logoKey && line.logoUrl) {
      setLogo({ key: line.logoKey, url: line.logoUrl, name: line.logoName ?? "Your logo" });
      setStage("placement");
    }
    setNotice("Editing a kit from your cart. Saving replaces that cart line; nothing else in your cart changes.");
    scrollToBuilder();
  }, [search, products, productBySlug, cart.lines]);

  /* ---------------- Pricing (same function the API charges with) ---------------- */

  const merged = useMemo(() => mergeRows(rows), [rows]);
  const price = useMemo(() => priceKit(merged), [merged]);
  const tiers = bundleTiers();
  const firstTier = tiers[0];
  const toNext = price.nextTier ? price.nextTier.pieces - price.pieces : 0;
  const nextDiscount = price.nextTier
    ? bundles.find((b) => b.id === price.nextTier!.id)?.discountPercent ?? null
    : null;
  const currentDiscount = price.tier ? bundles.find((b) => b.id === price.tier!.id)?.discountPercent ?? null : null;
  const ratio = price.fullPrice > 0 ? price.total / price.fullPrice : 1;

  /* ---------------- Garments (product + colour) for placement ---------------- */

  const garments = useMemo<KitGarmentView[]>(() => {
    const map = new Map<string, KitGarmentView>();
    const variantsByKey = new Map<string, Set<string>>();
    for (const m of merged) {
      const product = productBySlug.get(m.slug);
      const colour = product?.colours.find((c) => c.id === m.colourId);
      if (!product || !colour) continue;
      const key = garmentKey(m.slug, m.colourId);
      let g = map.get(key);
      if (!g) {
        g = { key, product, colour, sizes: [], pieces: 0, name: product.name };
        map.set(key, g);
        variantsByKey.set(key, new Set());
      }
      variantsByKey.get(key)!.add(m.variantId);
      g.pieces += m.quantity;
      // Options of one product share a garment photo + placement; sizes combine across them.
      const same = g.sizes.find((x) => x.size === m.size);
      if (same) same.quantity += m.quantity;
      else g.sizes.push({ size: m.size, quantity: m.quantity });
    }
    for (const g of map.values()) {
      const vs = [...(variantsByKey.get(g.key) ?? [])];
      g.name = vs.length === 1 ? garmentName(g.product, vs[0]) : g.product.name;
      g.sizes.sort((a, b) => g.product.sizes.indexOf(a.size) - g.product.sizes.indexOf(b.size));
    }
    return [...map.values()];
  }, [merged, productBySlug]);

  const shownStage: Stage = stage !== "build" && logo && price.pieces > 0 ? stage : "build";
  const currentKey = garments.some((g) => g.key === selectedKey) ? selectedKey : (garments[0]?.key ?? "");
  const canPlace = Boolean(logo) && price.pieces > 0 && !upload.isPending;
  // Embroidery is charged per embroidered garment on top of the (discounted) garment prices.
  const embroidery = logo ? kitEmbroidery(garments, placements) : { fee: 0, pieces: 0 };
  const grandTotal = price.total + embroidery.fee;

  const goStage = (next: Stage) => {
    if (next !== "build" && !canPlace) return;
    setStage(next);
    scrollToBuilder();
  };

  /** What gets saved per garment: disabled views become null; no back where the garment takes none. */
  const savedPlacements = (): KitPlacement[] =>
    garments.map((g) => {
      const s = placementFor(g, placements);
      return {
        slug: g.product.slug,
        colourId: g.colour.id,
        frontLogo: s.front.enabled ? s.front : null,
        backLogo: backSupported(g.product, g.colour) && s.back.enabled ? s.back : null,
      };
    });

  /* ---------------- Logo ---------------- */

  const onLogo = (file: File) => {
    upload.mutate(file, {
      onSuccess: (result) => setLogo(result),
    });
  };

  /* ---------------- Cart ---------------- */

  const addToCart = () => {
    if (price.pieces === 0) return;
    const saved = logo ? savedPlacements() : [];
    const placementOf = (slug: string, colourId: string) =>
      saved.find((p) => p.slug === slug && p.colourId === colourId) ?? null;
    if (price.tier) {
      const tier = price.tier;
      const line: Omit<CartLine, "id"> = {
        kind: "bundle",
        slug: tier.id,
        label: `Custom kit — ${tier.tier} rate (${price.pieces} pcs)`,
        colourName: "Kit mix",
        size: "Mixed",
        quantity: 1,
        unitPrice: price.total,
        image: tier.image,
        logoKey: logo?.key ?? null,
        logoName: logo?.name ?? null,
        logoUrl: logo?.url ?? null,
        frontLogo: null,
        backLogo: null,
        sizes: merged.map((m) => ({
          slug: m.slug,
          size: m.size,
          quantity: m.quantity,
          colourId: m.colourId,
          variantId: m.variantId,
        })),
        placements: logo ? saved : undefined,
      };
      const replaced = editingId ? cart.replaceLine(editingId, line) : false;
      if (!replaced) cart.addLine({ ...line, quantity: 1 });
      setFlash(
        `${replaced ? "Kit updated in your cart" : "Custom kit added"} — ${price.pieces} pieces at the ${tier.tier} rate, ${formatAUD(grandTotal)}${
          embroidery.fee ? ` incl. ${formatAUD(embroidery.fee)} embroidery` : ""
        }${
          logo ? `, with your logo placed on ${garments.length} ${garments.length === 1 ? "garment" : "garments"}` : ""
        }.`,
      );
    } else {
      // Under the bundle minimum: each garment goes in at its own price, keeping its own placement.
      if (editingId) cart.removeLine(editingId);
      for (const m of merged) {
        const product = productBySlug.get(m.slug);
        if (!product) continue;
        const colour = product.colours.find((c) => c.id === m.colourId) ?? product.colours[0];
        const variant = getVariant(product, m.variantId) ?? getVariant(product)!;
        cart.addLine({
          kind: "product",
          slug: product.slug,
          label: `${garmentName(product, variant.id)} · ${colour.name} · ${m.size}`,
          variantId: variant.id,
          colourId: colour.id,
          colourName: colour.name,
          size: m.size,
          quantity: m.quantity,
          unitPrice: variant.price,
          image: colour.front,
          logoKey: logo?.key ?? null,
          logoName: logo?.name ?? null,
          logoUrl: logo?.url ?? null,
          frontLogo: placementOf(product.slug, colour.id)?.frontLogo ?? null,
          backLogo: placementOf(product.slug, colour.id)?.backLogo ?? null,
        });
      }
      setFlash(
        `${price.pieces} ${price.pieces === 1 ? "piece" : "pieces"} added at individual prices (${formatAUD(grandTotal)}${
          embroidery.fee ? ` incl. ${formatAUD(embroidery.fee)} embroidery` : ""
        }).`,
      );
    }
    setRows([]);
    setNotice(null);
    setPlacements({});
    setStage("build");
    if (editingId) {
      setEditingId(null);
      navigate("/bundle-deals", { replace: true });
    }
    scrollToBuilder();
    window.setTimeout(() => setFlash(null), 8000);
  };

  const ctaLabel =
    price.pieces === 0
      ? "Add garments to start"
      : price.tier
        ? `${editingId ? "Update kit in cart" : "Add kit to cart"} · ${formatAUD(grandTotal)}`
        : `Add ${price.pieces} ${price.pieces === 1 ? "piece" : "pieces"} · ${formatAUD(grandTotal)}`;

  /* ---------------- Render ---------------- */

  return (
    <>
      <PageIntro
        title={
          <>
            Your mix.
            <br />
            Bundle pricing.
          </>
        }
        intro={`Choose any garments, colours, sizes and quantities. Once your kit reaches ${firstTier?.pieces ?? 39} pieces the seasonal bundle rate applies to the whole kit — bigger kits unlock bigger rates.`}
      >
        <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-white/15 pt-6">
          <div>
            <dt className="tf-eyebrow text-white/80">Bundle rate from</dt>
            <dd className="font-display text-2xl font-extrabold text-tf-yellow">
              {firstTier ? `${firstTier.pieces} pcs` : "—"}
            </dd>
          </div>
          <div>
            <dt className="tf-eyebrow text-white/80">Best rate</dt>
            <dd className="font-display text-2xl font-extrabold text-tf-yellow">
              {bundles.length ? `${Math.max(...bundles.map((b) => b.discountPercent))}% off` : "—"}
            </dd>
          </div>
        </dl>
      </PageIntro>

      {catalogue.isLoading ? (
        <div className="tf-shell flex min-h-[50vh] items-center gap-3 py-24 text-sm text-tf-steel">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the range…
        </div>
      ) : catalogue.isError ? (
        <div className="tf-shell py-24 text-sm text-tf-rust">
          The range didn&apos;t load. Refresh to try again.
        </div>
      ) : (
        <>
          {/* ---------- How the rate works ---------- */}
          <section className="bg-white py-14 md:py-16">
            <div className="tf-shell">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <h2 className="tf-display text-[clamp(1.6rem,3.4vw,2.4rem)] text-tf-ink">
                    The rate follows your piece count
                  </h2>
                </div>
                <p className="max-w-md text-[0.88rem] leading-relaxed text-tf-steel">
                  Each tier&apos;s rate comes from its published pack price against the full price of
                  that pack. Any mix with at least that many pieces gets the rate, and you always get
                  the best rate you qualify for, so adding pieces never costs you more per item. Under{" "}
                  {firstTier?.pieces ?? 39} pieces, garments are charged at their individual prices.
                </p>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {bundles.map((b, i) => {
                  const current = price.tier?.id === b.id;
                  return (
                    <Reveal key={b.id} delay={i * 45} as="div">
                      <article
                        className={cn(
                          "flex h-full flex-col border bg-white",
                          current ? "border-tf-navy shadow-[0_22px_44px_-32px_rgba(6,21,46,0.6)]" : "border-tf-line",
                        )}
                      >
                        <div className="relative">
                          <img
                            src={b.image}
                            alt={`${b.tier} example kit`}
                            loading="lazy"
                            className="aspect-[37/27] w-full object-cover"
                          />
                          <span className="absolute top-0 left-0 bg-tf-yellow px-3 py-1.5 font-display text-[0.68rem] font-black tracking-[0.14em] text-tf-navy-deep uppercase">
                            {b.pieces}+ pieces
                          </span>
                          {current ? (
                            <span className="absolute right-0 bottom-0 flex items-center gap-1 bg-tf-navy px-3 py-1.5 font-display text-[0.68rem] font-bold tracking-[0.1em] text-tf-yellow uppercase">
                              <Check className="size-3.5" aria-hidden /> Your rate
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-1 flex-col p-5">
                          <h3 className="tf-display text-[1.25rem] text-tf-ink">{b.tier}</h3>
                          <p className="mt-3 font-display text-[1.6rem] leading-none font-extrabold text-tf-navy">
                            {b.discountPercent}% off
                          </p>
                          <p className="mt-2 text-[0.8rem] leading-relaxed text-tf-steel">
                            {b.name} example mix: {b.contents} — {formatAUD(b.price)} (full price{" "}
                            {formatAUD(b.fullPrice)}).
                          </p>
                          <div className="mt-auto pt-5">
                            <button
                              type="button"
                              className="btn-base btn-secondary w-full !py-2.5 !text-[0.8rem] text-tf-navy hover:text-tf-navy"
                              onClick={() => loadExample(b)}
                            >
                              <span>Start from this mix</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---------- Builder ---------- */}
          <section
            ref={builderRef}
            id="builder"
            className="scroll-mt-24 border-t border-tf-line bg-tf-paper py-14 md:py-20"
          >
            <div className="tf-shell">
              {/* Stage tracker — placement and review need a logo and at least one piece. */}
              <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="Bundle steps">
                {STAGES.map((st, i) => {
                  const current = shownStage === st.id;
                  const reachable = st.id === "build" || canPlace;
                  return (
                    <li key={st.id}>
                      <button
                        type="button"
                        aria-current={current ? "step" : undefined}
                        disabled={!reachable}
                        onClick={() => goStage(st.id)}
                        className={cn(
                          "flex items-center gap-2 border px-3 py-1.5 font-display text-[0.78rem] font-bold transition-colors",
                          current
                            ? "border-tf-navy bg-tf-navy text-white"
                            : reachable
                              ? "border-tf-line bg-white text-tf-ink hover:border-tf-navy"
                              : "border-tf-line bg-white/60 text-tf-steel",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-5 place-items-center text-[0.68rem]",
                            current ? "bg-tf-yellow text-tf-navy-deep" : "bg-tf-paper text-tf-navy",
                          )}
                        >
                          {i + 1}
                        </span>
                        {st.label}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <h2 className="tf-display text-[clamp(1.6rem,3.4vw,2.4rem)] text-tf-ink">
                {shownStage === "build"
                  ? "Pick garments, set the quantities"
                  : shownStage === "placement"
                    ? "Choose logo spots for each garment"
                    : "Review your bundle"}
              </h2>
              {shownStage !== "build" ? (
                <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-tf-steel">
                  {shownStage === "placement"
                    ? "Pick one front spot and one back spot per garment from its approved print spots. Set one garment and apply it to every compatible garment, or go through them one by one."
                    : "Check every garment, its sizes and where the logo sits. Go back to change anything before it goes in the cart."}
                </p>
              ) : null}

              {shownStage === "build" ? (
              <>
              {/* Add garments */}
              <div className="mt-7">
                <p className="text-[0.85rem] font-semibold text-tf-ink">Add a garment</p>
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                  {products.map((p) => {
                    const inKit = merged.filter((m) => m.slug === p.slug).reduce((s, m) => s + m.quantity, 0);
                    const from = fromPrice(p);
                    return (
                      <li key={p.slug}>
                        <button
                          type="button"
                          onClick={() => addProduct(p)}
                          className="group flex h-full w-full flex-col border border-tf-line bg-white text-left transition-colors hover:border-tf-navy focus-visible:border-tf-navy"
                          aria-label={`Add a ${p.name} to the kit${inKit ? ` (${inKit} in kit)` : ""}`}
                        >
                          <span className="tf-stage relative block aspect-square">
                            <img
                              src={p.image}
                              alt=""
                              loading="lazy"
                              className="absolute inset-0 h-full w-full object-contain p-2"
                            />
                            {inKit ? (
                              <span className="absolute top-0 right-0 bg-tf-navy px-2 py-0.5 font-display text-[0.64rem] font-bold text-tf-yellow">
                                {inKit}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center justify-between gap-1 border-t border-tf-line px-2.5 py-2">
                            <span className="min-w-0">
                              <span className="block truncate font-display text-[0.8rem] font-bold text-tf-ink">
                                {p.name}
                              </span>
                              <span className="block text-[0.72rem] text-tf-steel">
                                {from.varies ? `From ${formatAUD(from.price)}` : formatAUD(from.price)}
                              </span>
                            </span>
                            <Plus className="size-4 shrink-0 text-tf-navy" aria-hidden />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              </>
              ) : null}

              {notice && stage === "build" ? (
                <p className="mt-6 flex items-start gap-2 border border-tf-navy/25 bg-white px-4 py-3 text-[0.86rem] text-tf-ink">
                  <Info className="mt-0.5 size-4 shrink-0 text-tf-navy" aria-hidden />
                  <span className="flex-1">{notice}</span>
                  <button
                    type="button"
                    className="grid size-6 place-items-center text-tf-steel hover:text-tf-ink"
                    aria-label="Dismiss"
                    onClick={() => setNotice(null)}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </p>
              ) : null}

              {shownStage === "placement" && logo && logoUrl ? (
                <div className="mt-8">
                  <RemoveBackground
                    logo={logo}
                    onChange={setLogo}
                    className="mb-5 border border-tf-line bg-tf-paper px-4 py-3"
                    always
                  />
                  <KitPlacementStage
                    garments={garments}
                    placements={placements}
                    onPlacements={setPlacements}
                    selectedKey={currentKey}
                    onSelect={setSelectedKey}
                    logo={{ url: logoUrl, name: logo.name }}
                    onBackToKit={() => goStage("build")}
                    onReview={() => goStage("review")}
                  />
                </div>
              ) : shownStage === "review" && logo && logoUrl ? (
                <div className="mt-8">
                  <KitReviewStage
                    garments={garments}
                    placements={placements}
                    logo={{ url: logoUrl, name: logo.name }}
                    price={price}
                    discountPercent={currentDiscount}
                    ctaLabel={ctaLabel}
                    onEdit={(key) => {
                      setSelectedKey(key);
                      goStage("placement");
                    }}
                    onBackToPlacement={() => goStage("placement")}
                    onBackToKit={() => goStage("build")}
                    onConfirm={addToCart}
                  />
                </div>
              ) : (
              <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
                {/* Rows */}
                <div className="min-w-0 border border-tf-line bg-white">
                  <div className="flex items-center justify-between gap-3 border-b border-tf-line px-4 py-3 md:px-5">
                    <h3 className="font-display text-[0.95rem] font-bold text-tf-ink">
                      Your kit · {price.pieces} {price.pieces === 1 ? "piece" : "pieces"}
                    </h3>
                    {rows.length ? (
                      <button
                        type="button"
                        className="text-[0.8rem] font-semibold text-tf-steel underline hover:text-tf-ink"
                        onClick={() => {
                          setRows([]);
                          setNotice(null);
                        }}
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  {rows.length === 0 ? (
                    <p className="px-5 py-10 text-center text-[0.9rem] text-tf-steel">
                      Nothing in the kit yet. Add garments above, or start from one of the example mixes.
                    </p>
                  ) : (
                    <ul className="divide-y divide-tf-line">
                      {rows.map((row) => {
                        const product = productBySlug.get(row.slug);
                        if (!product) return null;
                        const colour = product.colours.find((c) => c.id === row.colourId) ?? product.colours[0];
                        const variant = getVariant(product, row.variantId) ?? getVariant(product)!;
                        const rowName = garmentName(product, variant.id);
                        const lineFull = variant.price * row.quantity;
                        return (
                          <li
                            key={row.id}
                            className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-4 md:grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center md:px-5"
                          >
                            <div className="tf-stage row-span-2 size-16 border border-tf-line md:row-span-1 md:size-[4.5rem]">
                              <img src={colour.front} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-display text-[0.95rem] font-bold text-tf-ink">{rowName}</p>
                              <p className="text-[0.76rem] text-tf-steel">
                                {formatAUD(variant.price)} each
                                {variant.material ? ` · ${variant.material}` : ""}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {product.variants.length > 1 ? (
                                  <label className="min-w-0">
                                    <span className="sr-only">{product.name} option</span>
                                    <select
                                      data-variant-select
                                      value={variant.id}
                                      onChange={(e) => patchRow(row.id, { variantId: e.target.value })}
                                      className="tf-input !w-auto !py-1.5 !text-[0.8rem]"
                                    >
                                      {product.variants.map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.label} · {formatAUD(v.price)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : null}
                                <label className="min-w-0">
                                  <span className="sr-only">{product.name} colour</span>
                                  <select
                                    data-colour-select
                                    value={row.colourId}
                                    onChange={(e) => patchRow(row.id, { colourId: e.target.value })}
                                    className="tf-input !w-auto !py-1.5 !text-[0.8rem]"
                                  >
                                    {variantColours(product, variant.id).map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span className="sr-only">{product.name} size</span>
                                  <select
                                    value={row.size}
                                    onChange={(e) => patchRow(row.id, { size: e.target.value })}
                                    className="tf-input !w-auto !py-1.5 !text-[0.8rem]"
                                  >
                                    {product.sizes.map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            </div>
                            <div className="col-start-2 flex items-center gap-1 md:col-start-auto">
                              <button
                                type="button"
                                className="grid size-9 place-items-center border border-tf-line text-tf-navy hover:border-tf-navy disabled:opacity-40"
                                aria-label={`One fewer ${rowName} ${colour.name} ${row.size}`}
                                disabled={row.quantity <= 1}
                                onClick={() => setQty(row.id, row.quantity - 1)}
                              >
                                <Minus className="size-4" aria-hidden />
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={MAX_QTY}
                                value={row.quantity}
                                onChange={(e) => setQty(row.id, Number(e.target.value))}
                                className="tf-input !w-16 !px-1 !py-1.5 text-center font-display !text-[0.92rem] font-bold"
                                aria-label={`Quantity of ${rowName} ${colour.name} ${row.size}`}
                              />
                              <button
                                type="button"
                                className="grid size-9 place-items-center border border-tf-line text-tf-navy hover:border-tf-navy disabled:opacity-40"
                                aria-label={`One more ${rowName} ${colour.name} ${row.size}`}
                                disabled={row.quantity >= MAX_QTY}
                                onClick={() => setQty(row.id, row.quantity + 1)}
                              >
                                <Plus className="size-4" aria-hidden />
                              </button>
                              <button
                                type="button"
                                className="ml-2 grid size-9 place-items-center border border-tf-line text-tf-steel hover:border-tf-orange hover:text-tf-rust"
                                aria-label={`Remove ${rowName} ${colour.name} ${row.size}`}
                                onClick={() => removeRow(row.id)}
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </button>
                            </div>
                            <p className="col-start-2 text-[0.84rem] md:col-start-auto md:min-w-[6.5rem] md:text-right">
                              <span className="font-display font-bold text-tf-ink">{formatAUD(lineFull)}</span>
                              {price.tier ? (
                                <span className="block text-[0.72rem] text-tf-steel">
                                  ≈ {formatAUD(Math.round(lineFull * ratio))} at bundle rate
                                </span>
                              ) : null}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Summary */}
                <aside
                  aria-label="Kit total"
                  className="border border-tf-line-dark bg-tf-navy-deep text-white lg:sticky lg:top-24"
                >
                  <div className="p-5">
                    <h3 className="font-display text-[1.05rem] font-extrabold text-white">Kit total</h3>
                    <dl className="mt-4 space-y-2 text-[0.88rem]">
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
                          {price.tier ? `${price.tier.tier} · ${currentDiscount}% off` : "Individual pricing"}
                        </dd>
                      </div>
                      {price.saving > 0 ? (
                        <div className="flex justify-between gap-4">
                          <dt className="text-white/80">Bundle saving</dt>
                          <dd className="font-display font-bold text-tf-yellow">−{formatAUD(price.saving)}</dd>
                        </div>
                      ) : null}
                      {embroidery.fee ? (
                        <div className="flex justify-between gap-4">
                          <dt className="text-white/80">Embroidery</dt>
                          <dd className="text-right font-display font-bold">
                            {embroidery.pieces} × {formatAUD(EMBROIDERY_FEE)} = +{formatAUD(embroidery.fee)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/15 pt-4">
                      <span className="text-[0.8rem] text-white/80">Total inc. GST</span>
                      <span className="font-display text-[1.8rem] leading-none font-extrabold text-tf-yellow" aria-live="polite">
                        {formatAUD(grandTotal)}
                      </span>
                    </div>
                    <p className="mt-2 text-[0.74rem] leading-snug text-white/70">
                      Printing is included. Embroidery adds {formatAUD(EMBROIDERY_FEE)} per garment —
                      choose it per garment at the logo spots step. Shipping is calculated at checkout.
                    </p>

                    {price.nextTier ? (
                      <p className="mt-4 border-l-2 border-tf-yellow bg-white/5 px-3 py-2 text-[0.8rem] leading-snug text-white">
                        {price.tier ? "Add" : price.pieces === 0 ? "Bundle rate starts at" : "Add"}{" "}
                        {price.pieces === 0 && !price.tier ? (
                          <strong>{price.nextTier.pieces} pieces</strong>
                        ) : (
                          <>
                            <strong>
                              {toNext} more {toNext === 1 ? "piece" : "pieces"}
                            </strong>{" "}
                            for the {price.nextTier.tier} rate
                          </>
                        )}
                        {nextDiscount != null ? ` (${nextDiscount}% off)` : ""}.
                      </p>
                    ) : price.tier ? (
                      <p className="mt-4 text-[0.8rem] text-white/80">You&apos;re on the best rate.</p>
                    ) : null}
                    {!price.tier && price.pieces > 0 ? (
                      <p className="mt-2 text-[0.76rem] leading-snug text-white/80">
                        Under {firstTier?.pieces ?? 39} pieces each garment is charged at its individual
                        price — no bundle rate is applied.
                      </p>
                    ) : null}
                  </div>

                  <div className="border-t border-white/10 p-5">
                    <p className="text-[0.84rem] font-semibold text-white">Logo for the kit (optional)</p>
                    <p className="mt-1 text-[0.76rem] leading-snug text-white/80">
                      Upload it here, then pick a fixed print spot on each garment — one front, one
                      back. We confirm the artwork with you before printing.
                    </p>
                    <label className="btn-base btn-secondary mt-3 w-full cursor-pointer !py-2.5 !text-[0.8rem] text-white hover:text-white">
                      <Upload className="size-4" aria-hidden />
                      <span>{logo ? "Replace logo" : "Upload logo"}</span>
                      <input
                        type="file"
                        className="sr-only"
                        aria-label={logo ? "Replace logo" : "Upload logo"}
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onLogo(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {upload.isPending ? (
                      <p className="mt-2 flex items-center gap-2 text-[0.78rem] text-white/80">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Uploading…
                      </p>
                    ) : null}
                    {logo && !upload.isPending ? (
                      <p className="mt-2 flex items-center gap-2 text-[0.78rem] font-semibold text-tf-yellow">
                        <Check className="size-3.5 shrink-0" aria-hidden /> <span className="min-w-0 truncate">{logo.name}</span>
                        <button
                          type="button"
                          className="ml-auto shrink-0 text-white/85 underline underline-offset-2 hover:text-white"
                          onClick={() => setLogo(null)}
                        >
                          Remove
                        </button>
                      </p>
                    ) : null}
                    {logo && !upload.isPending ? (
                      <RemoveBackground logo={logo} onChange={setLogo} tone="dark" className="mt-3" />
                    ) : null}
                    {upload.isError ? (
                      <p role="alert" className="mt-2 flex gap-2 text-[0.78rem] text-white">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-tf-orange" aria-hidden />
                        {(upload.error as Error).message}
                      </p>
                    ) : null}
                  </div>

                  <div className="border-t border-white/10 p-5">
                    {logo ? (
                      <>
                        <button
                          type="button"
                          className="btn-base btn-primary w-full"
                          disabled={!canPlace}
                          onClick={() => goStage("placement")}
                        >
                          {price.pieces === 0 ? "Add garments to start" : "Continue to logo spots"}{" "}
                          <ArrowRight className="size-4" aria-hidden />
                        </button>
                        {price.pieces > 0 ? (
                          <p className="mt-2 text-[0.74rem] leading-snug text-white/80">
                            Next: place your logo on each of the {garments.length}{" "}
                            {garments.length === 1 ? "garment" : "garments"}, then review the bundle before it
                            goes in the cart.
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-base btn-primary w-full"
                        disabled={price.pieces === 0}
                        onClick={addToCart}
                      >
                        <ShoppingCart className="size-4" aria-hidden /> {ctaLabel}
                      </button>
                    )}
                    {flash ? (
                      <output className="block mt-3 text-[0.8rem] font-semibold text-tf-yellow">
                        <Check className="mr-1 inline size-3.5" aria-hidden />
                        {flash}{" "}
                        <Link to="/cart" className="underline underline-offset-4">
                          Go to cart
                        </Link>
                      </output>
                    ) : null}
                  </div>
                </aside>
              </div>
              )}
            </div>
          </section>
        </>
      )}

      <section className="border-t border-tf-line bg-white py-14">
        <div className="tf-shell flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="tf-display text-[clamp(1.4rem,3vw,2rem)] text-tf-ink">Not sure what mix fits?</h2>
            <p className="mt-2 max-w-xl text-[0.9rem] leading-relaxed text-tf-steel">
              Tell us the crew size and the trades and we&apos;ll recommend a mix.
            </p>
          </div>
          <Link to="/contact" className="btn-base btn-secondary text-tf-navy hover:text-tf-navy">
            <span>Talk to us</span> <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
