import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight, Minus, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { formatAUD, garmentName, getProduct } from "../../shared/catalogue";
import { PageIntro } from "../components/layout";
import { KitPlacementSummary, sizesByGarment } from "../components/bundle/kit-placement-summary";
import { useSignedLogos } from "../lib/signed-logos";
import { type CartLine, useCart } from "../lib/cart";
import { describePlacement } from "../lib/garment";

/** "Front: Left Chest · up to 9 × 9 cm · Back: Standard Back · up to 30 × 15 cm". */
function lineSpots(line: CartLine) {
  const product = getProduct(line.slug);
  const colour = product?.colours.find((c) => c.id === line.colourId);
  if (!product || !colour) return "";
  const parts = [
    line.frontLogo?.enabled ? `Front: ${describePlacement(product, colour, "front", line.frontLogo)}` : null,
    line.backLogo?.enabled ? `Back: ${describePlacement(product, colour, "back", line.backLogo)}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
import { toOrderLines, useQuote } from "../queries/orders";
import { usePaymentStatus } from "../queries/orders";
import { useDelivery } from "../lib/delivery";
import {
  LineDecoration,
  OrderTotals,
  SHIPPING_SOURCE_NOTE,
  ShippingPostcode,
} from "../components/order/order-summary";
import { ShippingQuoteRequest } from "../components/order/shipping-quote-request";

export default function CartPage() {
  const cart = useCart();
  const orderLines = useMemo(() => toOrderLines(cart.lines), [cart.lines]);
  const delivery = useDelivery();
  const quote = useQuote(orderLines, delivery);
  const payment = usePaymentStatus();
  const signed = useSignedLogos(cart.lines.map((l) => l.logoKey));

  const quoteError =
    quote.isError && orderLines.length > 0
      ? ((quote.error as { message?: string })?.message ??
        "We couldn't price one of the lines in your cart.")
      : null;
  const customQuote = quote.data?.shipping.status === "custom_quote";
  const blocked = Boolean(quoteError) || customQuote;

  if (cart.lines.length === 0) {
    return (
      <>
        <PageIntro
          title="Nothing in the kit yet."
          intro="Add garments or a preset bundle and they'll show up here with their colours, sizes and logos."
        />
        <div className="tf-shell py-16">
          <div className="flex flex-wrap gap-3">
            <Link to="/shop" className="btn-base btn-primary">
              Shop the range <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link to="/bundle-deals" className="btn-base btn-secondary text-tf-navy">
              <span>See bundle deals</span>
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageIntro
        title="Your kit."
        intro="Every line keeps its colour, size and logo placement through to checkout."
      />

      <section className="bg-white py-12 md:py-16">
        <div className="tf-shell grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-14">
          {/* ---------- Lines ---------- */}
          <div>
            <ul className="border-t border-tf-line">
              {cart.lines.map((line, i) => {
                // Server-priced line (current catalogue price); falls back to the cart's copy.
                const priced = quote.data?.lines[i];
                const unit = priced?.unitPrice ?? line.unitPrice;
                const bundlePieces =
                  line.kind === "bundle"
                    ? (line.sizes ?? []).reduce((sum, e) => sum + e.quantity, 0)
                    : 0;
                const product = line.kind === "product" ? getProduct(line.slug) : undefined;
                return (
                  <li key={line.id} className="border-b border-tf-line py-6">
                    <div className="flex gap-4 sm:gap-6">
                      <div className="tf-stage size-24 shrink-0 border border-tf-line bg-tf-paper sm:size-32">
                        {line.image ? (
                          <img
                            src={line.image}
                            alt=""
                            className="h-full w-full object-contain p-1.5"
                            loading="lazy"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="tf-display text-[1.15rem] text-tf-ink">
                              {product ? (
                                <Link to={`/product/${product.slug}`} className="hover:underline">
                                  {line.label}
                                </Link>
                              ) : (
                                line.label
                              )}
                            </h2>
                            <p className="mt-1.5 text-[0.85rem] text-tf-steel">
                              {formatAUD(unit)} {line.kind === "bundle" ? "per kit" : "each"} ·{" "}
                              {line.kind === "bundle"
                                ? `${bundlePieces} pieces in your mix`
                                : `Size ${line.size ?? "—"}`}
                            </p>
                            {priced?.material ? (
                              <p className="mt-0.5 text-[0.8rem] text-tf-steel">{priced.material}</p>
                            ) : null}
                          </div>
                          <p className="font-display text-[1.05rem] font-bold text-tf-ink" data-testid="line-total">
                            {formatAUD(priced?.lineTotal ?? unit * line.quantity)}
                          </p>
                        </div>
                        {line.logoKey ? <LineDecoration priced={priced} /> : null}

                        {/* Bundle size breakdown */}
                        {line.kind === "bundle" && line.sizes?.length ? (
                          <details className="mt-3 border border-tf-line bg-tf-paper px-3 py-2">
                            <summary className="cursor-pointer font-display text-[0.78rem] font-bold tracking-[0.06em] text-tf-navy uppercase">
                              Size breakdown ({line.sizes.reduce((s, e) => s + e.quantity, 0)} pcs)
                            </summary>
                            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                              {line.sizes.map((entry) => (
                                <li
                                  key={`${entry.slug}-${entry.variantId ?? ""}-${entry.colourId ?? ""}-${entry.size}`}
                                  className="flex justify-between gap-3 text-[0.82rem] text-tf-steel"
                                >
                                  <span>
                                    {(() => {
                                      const p = getProduct(entry.slug);
                                      return p ? garmentName(p, entry.variantId) : entry.slug;
                                    })()}
                                    {entry.colourId
                                      ? ` · ${getProduct(entry.slug)?.colours.find((c) => c.id === entry.colourId)?.name ?? ""}`
                                      : ""}
                                  </span>
                                  <span className="font-semibold text-tf-ink">
                                    {entry.size} × {entry.quantity}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}

                        {/* Bundle: each garment's own logo placement */}
                        {line.kind === "bundle" && line.logoKey ? (
                          <div className="mt-3 border border-tf-line px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-display text-[0.78rem] font-bold tracking-[0.06em] text-tf-navy uppercase">
                                Logo placement per garment
                              </span>
                              <Link
                                to={`/bundle-deals?edit=${line.id}`}
                                className="inline-flex min-h-9 items-center gap-1.5 text-[0.8rem] font-semibold text-tf-navy underline underline-offset-4"
                              >
                                <Pencil className="size-3.5" aria-hidden /> Edit placements
                              </Link>
                            </div>
                            {line.placements?.length ? (
                              <KitPlacementSummary
                                logoUrl={(line.logoKey && signed[line.logoKey]) || line.logoUrl || null}
                                garments={line.placements.map((p) => {
                                  const vs = [
                                    ...new Set(
                                      (line.sizes ?? [])
                                        .filter((e) => e.slug === p.slug && e.colourId === p.colourId)
                                        .map((e) => e.variantId ?? ""),
                                    ),
                                  ];
                                  const product = getProduct(p.slug);
                                  return {
                                    ...p,
                                    name: product && vs.length === 1 ? garmentName(product, vs[0] || null) : undefined,
                                    sizes: sizesByGarment(line.sizes).get(`${p.slug}|${p.colourId}`),
                                  };
                                })}
                              />
                            ) : (
                              <p className="mt-1 text-[0.8rem] text-tf-steel">
                                Logo added, no per-garment placement saved yet — use Edit placements to set
                                it, or we&apos;ll confirm it with you before printing.
                              </p>
                            )}
                          </div>
                        ) : null}

                        {/* Logo thumbnail */}
                        {line.kind === "product" && line.logoUrl ? (
                          <div className="mt-3 flex items-center gap-3 border border-tf-line px-3 py-2">
                            <span className="tf-checker grid size-9 shrink-0 place-items-center border border-tf-line">
                              <img
                                src={line.logoUrl}
                                alt=""
                                className="max-h-7 max-w-7 object-contain"
                                loading="lazy"
                              />
                            </span>
                            <span className="min-w-0 text-[0.8rem] text-tf-steel">
                              {lineSpots(line) || "Logo uploaded — no spot chosen"}
                            </span>
                          </div>
                        ) : null}

                        {/* Quantity */}
                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          <div className="flex items-center border border-tf-line">
                            <button
                              type="button"
                              className="grid size-9 place-items-center text-tf-navy transition-colors hover:bg-tf-paper disabled:opacity-40"
                              aria-label={`Decrease quantity of ${line.label}`}
                              onClick={() => cart.setQuantity(line.id, line.quantity - 1)}
                            >
                              <Minus className="size-4" aria-hidden />
                            </button>
                            <label className="sr-only" htmlFor={`qty-${line.id}`}>
                              Quantity of {line.label}
                            </label>
                            <input
                              id={`qty-${line.id}`}
                              type="number"
                              aria-label={`Quantity of ${line.label}`}
                              min={1}
                              max={999}
                              value={line.quantity}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                if (Number.isFinite(next)) cart.setQuantity(line.id, next);
                              }}
                              className="h-9 w-14 border-x border-tf-line text-center font-display text-[0.9rem] font-bold text-tf-ink focus:outline-none"
                            />
                            <button
                              type="button"
                              className="grid size-9 place-items-center text-tf-navy transition-colors hover:bg-tf-paper"
                              aria-label={`Increase quantity of ${line.label}`}
                              onClick={() => cart.setQuantity(line.id, line.quantity + 1)}
                            >
                              <Plus className="size-4" aria-hidden />
                            </button>
                          </div>

                          {product ? (
                            <Link
                              to={`/product/${product.slug}${line.colourId ? `?colour=${line.colourId}` : ""}`}
                              className="font-display text-[0.8rem] font-bold tracking-[0.04em] text-tf-navy uppercase hover:text-tf-rust"
                            >
                              Reopen in studio
                            </Link>
                          ) : null}

                          <button
                            type="button"
                            className="ml-auto inline-flex items-center gap-2 font-display text-[0.8rem] font-bold tracking-[0.04em] text-tf-steel uppercase transition-colors hover:text-tf-rust"
                            onClick={() => cart.removeLine(line.id)}
                          >
                            <Trash2 className="size-3.5" aria-hidden /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <Link
                to="/shop"
                className="font-display text-[0.82rem] font-bold tracking-[0.04em] text-tf-navy uppercase hover:text-tf-rust"
              >
                ← Keep shopping
              </Link>
              <button
                type="button"
                className="font-display text-[0.82rem] font-bold tracking-[0.04em] text-tf-steel uppercase hover:text-tf-rust"
                onClick={() => cart.clearCart()}
              >
                Empty cart
              </button>
            </div>
          </div>

          {/* ---------- Summary ---------- */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="border border-tf-line bg-tf-paper p-6">
              <h2 className="tf-display text-[1.25rem] text-tf-ink">Order summary</h2>

              <div className="mt-5 border-b border-tf-line pb-5">
                <ShippingPostcode quote={quote.data} inputId="cart-postcode" />
              </div>

              <OrderTotals quote={quote.data} pieces={cart.pieces} fallbackSubtotal={cart.subtotal} />

              <p className="mt-3 text-[0.78rem] leading-relaxed text-tf-steel">
                {quote.isFetching
                  ? "Rechecking prices against the catalogue…"
                  : "Prices, embroidery and shipping recalculated on every change."}
              </p>
              <p className="mt-1.5 text-[0.72rem] leading-relaxed text-tf-steel">{SHIPPING_SOURCE_NOTE}</p>

              {quoteError ? (
                <p className="mt-4 border border-tf-orange/50 bg-tf-orange/10 px-3 py-2 text-[0.82rem] text-tf-ink">
                  {quoteError}
                </p>
              ) : null}

              {customQuote && !quoteError ? (
                <ShippingQuoteRequest lines={orderLines} />
              ) : (
                <Link
                  to="/checkout"
                  aria-disabled={blocked}
                  className={`btn-base btn-primary mt-5 w-full ${blocked ? "pointer-events-none opacity-55" : ""}`}
                >
                  Checkout <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}

              {payment.data && !payment.data.configured ? (
                <p className="mt-4 flex gap-2.5 border border-tf-line bg-white px-3 py-3 text-[0.78rem] leading-relaxed text-tf-steel">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
                  <span>
                    Card payments are not connected yet — missing{" "}
                    <code className="font-semibold text-tf-ink">
                      {payment.data.missing.join(", ")}
                    </code>
                    . You can still place the order and we'll confirm payment manually.
                  </span>
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
