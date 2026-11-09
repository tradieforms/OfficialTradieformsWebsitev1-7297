import { AlertTriangle, MapPin, Truck } from "lucide-react";
import { formatAUD } from "../../../shared/catalogue";
import { EMBROIDERY_FEE, methodLabel } from "../../../shared/decoration";
import { formatKg, METRO_SOURCE, zoneLabel } from "../../../shared/shipping";
import { setDelivery, useDelivery } from "../../lib/delivery";
import type { CartQuote, PricedCartLine } from "../../queries/orders";

/** "Embroidery · +A$16.00 per garment (3 garments) = A$48.00" for one priced cart line. */
export function LineDecoration({ priced }: { priced: PricedCartLine | undefined }) {
  if (!priced || !priced.decorationMethod) return null;
  const embroidered = priced.embroideryFee > 0;
  return (
    <p className="mt-1 text-[0.8rem] text-tf-steel" data-testid="line-decoration">
      <span className="font-semibold text-tf-ink">{methodLabel(priced.decorationMethod)}</span>
      {embroidered && priced.kind === "product" ? (
        <>
          {" "}
          · {formatAUD(priced.unitPrice)} + {formatAUD(EMBROIDERY_FEE)} embroidery ={" "}
          <span className="font-semibold text-tf-ink">
            {formatAUD(priced.unitPrice + priced.unitEmbroideryFee)} each
          </span>
        </>
      ) : embroidered ? (
        <>
          {" "}
          · +{formatAUD(EMBROIDERY_FEE)} per embroidered garment ({priced.embroideredPieces}{" "}
          {priced.embroideredPieces === 1 ? "garment" : "garments"}) ={" "}
          <span className="font-semibold text-tf-ink">{formatAUD(priced.embroideryFee)}</span>
        </>
      ) : (
        " · no embroidery fee"
      )}
    </p>
  );
}

/** Postcode → metro/regional, with the customer's correction. Shared by cart and checkout. */
export function ShippingPostcode({
  quote,
  inputId = "ship-postcode",
  showInput = true,
}: {
  quote: CartQuote | undefined;
  inputId?: string;
  showInput?: boolean;
}) {
  const delivery = useDelivery();
  const s = quote?.shipping;
  const detected = s?.detectedZone ?? null;
  const other = detected === "metro" ? "regional" : "metro";

  return (
    <div className="space-y-2">
      {showInput ? (
        <div>
          <label
            htmlFor={inputId}
            className="mb-1.5 block font-display text-[0.78rem] font-bold tracking-[0.06em] text-tf-ink uppercase"
          >
            Delivery postcode
          </label>
          <input
            id={inputId}
            aria-label="Delivery postcode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={4}
            placeholder="e.g. 2000"
            className="tf-input max-w-[9rem]"
            value={delivery.postcode}
            onChange={(e) => setDelivery({ postcode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          />
        </div>
      ) : null}

      {s?.postcode && detected ? (
        <div className="text-[0.8rem] leading-relaxed text-tf-steel" data-testid="ship-zone">
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-tf-navy" aria-hidden />
            <span>
              {s.postcode} is{" "}
              <strong className="text-tf-ink">
                {detected === "metro" ? `metro (${s.city})` : "regional"}
              </strong>{" "}
              on Australia Post&apos;s capital-city postcode list.
            </span>
          </p>
          {s.zoneOverride ? (
            <p className="mt-1 border border-tf-orange/50 bg-tf-orange/10 px-2.5 py-1.5 text-tf-ink">
              You&apos;ve set this delivery as <strong>{s.zone}</strong>. We&apos;ll check the zone on
              your order before dispatch.{" "}
              <button
                type="button"
                className="font-semibold text-tf-navy underline underline-offset-2"
                onClick={() => setDelivery({ zone: null })}
              >
                Use the Australia Post zone
              </button>
            </p>
          ) : (
            <button
              type="button"
              className="mt-1 text-[0.78rem] font-semibold text-tf-navy underline underline-offset-2"
              onClick={() => setDelivery({ zone: other })}
            >
              Not right? Treat this delivery as {other}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Garments / embroidery / shipping / total, exactly as the server priced them. */
export function OrderTotals({
  quote,
  pieces,
  fallbackSubtotal,
}: {
  quote: CartQuote | undefined;
  pieces: number;
  fallbackSubtotal: number;
}) {
  const s = quote?.shipping;
  const subtotal = quote?.subtotal ?? fallbackSubtotal;
  const total = quote?.total ?? fallbackSubtotal;

  return (
    <>
      <dl className="mt-5 space-y-2.5 text-[0.92rem]" data-testid="order-totals">
        <div className="flex justify-between gap-4">
          <dt className="text-tf-steel">
            Garments ({pieces} {pieces === 1 ? "item" : "items"})
          </dt>
          <dd className="font-semibold text-tf-ink" data-testid="totals-garments">
            {formatAUD(subtotal)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-tf-steel">
            Embroidery
            {quote?.embroideredPieces ? (
              <span className="block text-[0.78rem]">
                {quote.embroideredPieces} × {formatAUD(EMBROIDERY_FEE)} per garment
              </span>
            ) : null}
          </dt>
          <dd className="font-semibold text-tf-ink" data-testid="totals-embroidery">
            {quote?.embroideryFee ? formatAUD(quote.embroideryFee) : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-tf-steel">
            Shipping
            {s && s.status !== "empty" ? (
              <span className="block text-[0.78rem]" data-testid="totals-weight">
                {formatKg(s.grams)}
                {s.zone ? ` · ${zoneLabel(s.zone)}` : ""}
                {s.band && s.status === "ok" ? ` · ${s.band}` : ""}
              </span>
            ) : null}
          </dt>
          <dd className="text-right font-semibold text-tf-ink" data-testid="totals-shipping">
            {s?.status === "ok" && s.charge != null ? (
              formatAUD(s.charge)
            ) : s?.status === "custom_quote" ? (
              <span className="text-[0.85rem] text-tf-rust">Custom quote</span>
            ) : (
              <span className="text-[0.85rem] font-normal text-tf-steel">Enter postcode</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-tf-steel">GST</dt>
          <dd className="text-[0.85rem] text-tf-steel">Included in prices</dd>
        </div>
        <div className="mt-3 flex justify-between gap-4 border-t border-tf-line pt-4">
          <dt className="font-display text-[1rem] font-bold text-tf-ink">
            {quote?.complete ? "Total" : "Total before shipping"}
          </dt>
          <dd className="font-display text-[1.35rem] font-extrabold text-tf-ink" data-testid="totals-total">
            {formatAUD(total)}
          </dd>
        </div>
      </dl>

      {s?.status === "custom_quote" ? (
        <div
          className="mt-4 flex gap-2.5 border border-tf-orange/60 bg-tf-orange/10 px-3 py-3 text-[0.82rem] leading-relaxed text-tf-ink"
          role="alert"
          data-testid="ship-custom-quote"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
          <span>
            <strong>Custom shipping quote required.</strong> {s.message} Request a shipping quote and
            we&apos;ll email you the freight cost.
          </span>
        </div>
      ) : null}

      {s?.flags.length ? (
        <ul className="mt-3 space-y-1.5 text-[0.78rem] leading-relaxed text-tf-steel" data-testid="ship-flags">
          {s.flags.map((f) => (
            <li key={f} className="flex gap-1.5">
              <Truck className="mt-0.5 size-3.5 shrink-0 text-tf-navy" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export const SHIPPING_SOURCE_NOTE = `Metro = capital-city postcodes from ${METRO_SOURCE.name} (static list, copied ${METRO_SOURCE.copiedOn}). Everything else is regional.`;
