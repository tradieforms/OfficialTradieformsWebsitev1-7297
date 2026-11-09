import { AlertTriangle } from "lucide-react";
import { formatAUD } from "../../../shared/catalogue";
import { EMBROIDERY_FEE, methodLabel, type DecorationMethod } from "../../../shared/decoration";
import { formatKg, zoneLabel, type ShippingZone } from "../../../shared/shipping";
import { cn } from "../../lib/utils";

/** The stored order columns these views read (a subset of the orders row). */
export interface StoredOrder {
  subtotal: number;
  embroideryFee: number;
  embroideredPieces: number;
  shippingCharge: number | null;
  shippingZone: string | null;
  shippingZoneDetected: string | null;
  shippingZoneOverride: boolean;
  shippingWeightGrams: number | null;
  shippingBand: string | null;
  shippingFlags: string | null;
  shipAddress1: string | null;
  shipAddress2: string | null;
  shipSuburb: string | null;
  shipState: string | null;
  shipPostcode: string | null;
  total: number;
}

export function storedFlags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function shipToLines(o: StoredOrder): string[] {
  if (!o.shipAddress1 && !o.shipPostcode) return [];
  return [
    o.shipAddress1,
    o.shipAddress2,
    [o.shipSuburb, o.shipState, o.shipPostcode].filter(Boolean).join(" "),
  ].filter((x): x is string => Boolean(x));
}

/** "4.20 kg · Metro · Up to 5 kg" for a stored order. */
export function shippingSummary(o: StoredOrder): string {
  if (o.shippingCharge == null) return "Not calculated (order placed before shipping was added)";
  return [
    o.shippingWeightGrams != null ? formatKg(o.shippingWeightGrams) : null,
    zoneLabel(o.shippingZone as ShippingZone | null),
    o.shippingBand,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One stored line's method + fee ("Embroidery · 3 × A$16.00 = +A$48.00"). */
export function ItemDecoration({
  item,
  className,
}: {
  item: { decorationMethod: string | null; embroideredPieces: number; embroideryFee: number };
  className?: string;
}) {
  if (!item.decorationMethod) return null;
  return (
    <p className={cn("mt-1 text-[0.8rem] text-tf-steel", className)} data-testid="item-decoration">
      <span className="font-semibold text-tf-ink">
        {methodLabel(item.decorationMethod as DecorationMethod | "mixed")}
      </span>
      {item.embroideryFee > 0
        ? ` · embroidery ${item.embroideredPieces} × ${formatAUD(EMBROIDERY_FEE)} = +${formatAUD(item.embroideryFee)}`
        : " · no embroidery fee"}
    </p>
  );
}

/** Garments / embroidery / shipping / total for a saved order, plus ship-to and review flags. */
export function StoredOrderTotals({ order, tone = "light" }: { order: StoredOrder; tone?: "light" | "dark" }) {
  const flags = storedFlags(order.shippingFlags);
  const address = shipToLines(order);
  const muted = tone === "dark" ? "text-white/75" : "text-tf-steel";
  const strong = tone === "dark" ? "text-white" : "text-tf-ink";
  return (
    <div className="space-y-4" data-testid="stored-totals">
      <dl className="space-y-1.5 text-[0.88rem]">
        <div className="flex justify-between gap-4">
          <dt className={muted}>Garments</dt>
          <dd className={cn("font-semibold", strong)}>{formatAUD(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className={muted}>Embroidery</dt>
          <dd className={cn("text-right font-semibold", strong)}>
            {order.embroideryFee
              ? `${order.embroideredPieces} × ${formatAUD(EMBROIDERY_FEE)} = ${formatAUD(order.embroideryFee)}`
              : "None"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className={muted}>Shipping</dt>
          <dd className={cn("text-right font-semibold", strong)}>
            {order.shippingCharge != null ? formatAUD(order.shippingCharge) : "—"}
            <span className={cn("block text-[0.76rem] font-normal", muted)}>{shippingSummary(order)}</span>
          </dd>
        </div>
        <div className={cn("flex justify-between gap-4 border-t pt-2", tone === "dark" ? "border-white/15" : "border-tf-line")}>
          <dt className={cn("font-display font-bold", strong)}>Total inc. GST</dt>
          <dd className={cn("font-display text-[1.2rem] font-extrabold", strong)}>{formatAUD(order.total)}</dd>
        </div>
      </dl>
      {address.length ? (
        <div className="text-[0.84rem]">
          <p className={cn("font-display text-[0.72rem] font-bold tracking-[0.1em] uppercase", muted)}>Ship to</p>
          <p className={cn("mt-1 leading-snug", strong)}>
            {address.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
          </p>
        </div>
      ) : null}
      {order.shippingZoneOverride || flags.length ? (
        <ul className="space-y-1 border border-tf-orange/50 bg-tf-orange/10 px-3 py-2 text-[0.8rem] text-tf-ink" data-testid="stored-flags">
          {order.shippingZoneOverride && !flags.some((f) => /zone/i.test(f)) ? (
            <li className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-tf-rust" aria-hidden />
              Zone set by customer: {order.shippingZone} (postcode list says {order.shippingZoneDetected}).
            </li>
          ) : null}
          {flags.map((f) => (
            <li key={f} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-tf-rust" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
