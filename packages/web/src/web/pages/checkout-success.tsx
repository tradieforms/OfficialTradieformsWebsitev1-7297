import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowRight, Check, Clock, CreditCard, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { formatAUD } from "../../shared/catalogue";
import { PageIntro } from "../components/layout";
import { KitPlacementSummary, type PlacedGarment } from "../components/bundle/kit-placement-summary";
import { useSignedLogos } from "../lib/signed-logos";
import { ItemDecoration, StoredOrderTotals } from "../components/order/order-record";

/** Reads the per-garment kit config stored on a bundle order line. */
function kitGarments(raw: string | null | undefined): PlacedGarment[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { garments?: PlacedGarment[] };
    return Array.isArray(parsed.garments) ? parsed.garments : [];
  } catch {
    return [];
  }
}
import { useOrder, usePaymentStatus, useRefreshPayment, useStartPayment } from "../queries/orders";

/** Display name for the stored provider id. */
const PROVIDER_NAMES: Record<string, string> = { eway: "eWAY" };
const providerName = (id: string | null | undefined) => (id ? (PROVIDER_NAMES[id] ?? id) : null);

/** "Left Chest (9 × 9 cm)" from a stored order-line logo, or null. */
function storedSpot(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { production?: { label?: string; widthCm?: number; heightCm?: number } };
    return p.production?.label ? `${p.production.label} (${p.production.widthCm} × ${p.production.heightCm} cm)` : null;
  } catch {
    return null;
  }
}

export default function CheckoutSuccessPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const reference = params.get("ref");
  // Access token from checkout — without it only the signed-in account that placed the
  // order (or an admin) can open this page.
  const token = params.get("t");
  // eWAY appends AccessCode to the return URL; the cancel link carries cancelled=1.
  // URLSearchParams decodes a literal "+" as a space; base64 codes never contain spaces.
  const accessCode = params.get("AccessCode")?.replace(/ /g, "+") ?? null;
  const cancelled = params.get("cancelled") === "1";
  const order = useOrder(reference, token);
  const payment = usePaymentStatus();
  const refresh = useRefreshPayment();
  const retry = useStartPayment();
  const attempted = useRef(false);
  const [refreshed, setRefreshed] = useState(false);
  const [verified, setVerified] = useState<{ outcome: string; message: string | null } | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const signed = useSignedLogos((order.data?.items ?? []).map((i) => i.logoKey));
  const refetchOrder = order.refetch;

  // Verify with eWAY (server side) once on arrival, then let the polled query take over.
  // mutateAsync (not mutate + per-call callbacks) so the result is kept even if the observer
  // re-subscribes (React StrictMode) before the request settles.
  useEffect(() => {
    if (!reference || attempted.current) return;
    attempted.current = true;
    refresh
      .mutateAsync({ reference, token, accessCode, cancelled })
      .then((r) => setVerified({ outcome: r.outcome, message: r.outcomeMessage }))
      .catch(() => setVerified(null))
      .finally(() => {
        setRefreshed(true);
        void refetchOrder();
      });
  }, [reference, token, accessCode, cancelled, refresh, refetchOrder]);

  /** Same order, new eWAY page — earlier attempts are re-checked first, so no double charge. */
  const payAgain = () => {
    if (!reference) return;
    setRetryError(null);
    retry.mutate(
      { reference, token },
      {
        onSuccess: (result) => {
          if (result.configured && "url" in result && result.url) {
            window.location.href = result.url;
            return;
          }
          void refetchOrder();
        },
        onError: (err) =>
          setRetryError((err as { message?: string })?.message ?? "We couldn't open the payment page. Please try again."),
      },
    );
  };

  if (!reference) {
    return (
      <>
        <PageIntro
          title="No order reference."
          intro="This page needs an order reference. If you've just placed an order, use the link in your confirmation."
        />
        <div className="tf-shell py-16">
          <Link to="/shop" className="btn-base btn-primary">
            Back to the shop <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </>
    );
  }

  if (order.isLoading) {
    return (
      <div className="tf-shell flex min-h-[50vh] items-center gap-3 py-24 text-sm text-tf-steel">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading order {reference}…
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <>
        <PageIntro
          title="We can't find that order."
          intro={`We couldn't open order ${reference} from this link. Use the full link from checkout, sign in to the account that placed it, or get in touch and we'll track it down.`}
        />
        <div className="tf-shell py-16">
          <div className="flex flex-wrap gap-3">
            <Link to="/contact" className="btn-base btn-primary">
              Contact us <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link to="/shop" className="btn-base btn-secondary text-tf-navy">
              <span>Back to the shop</span>
            </Link>
          </div>
        </div>
      </>
    );
  }

  const { order: row, items } = order.data;
  const paid = row.paymentStatus === "paid";
  const notConfigured = payment.data ? !payment.data.configured : false;
  const sandbox = payment.data?.environment === "sandbox";
  const outcome = verified?.outcome ?? null;
  const declined = !paid && outcome === "declined";
  const wasCancelled = !paid && !declined && cancelled;
  const checking = !refreshed && !paid;
  const canRetry = !paid && !notConfigured && !checking;

  return (
    <>
      <PageIntro
        title={paid ? "Paid — nice one." : "Order saved."}
        intro={
          paid
            ? `Payment for ${row.reference} is confirmed. We'll be in touch about artwork and turnaround.`
            : `Order ${row.reference} is recorded against your details. It is not paid yet — read the payment status below.`
        }
      >
        <p className="mt-6 font-display text-[0.78rem] font-bold tracking-[0.16em] text-tf-yellow uppercase">
          Reference {row.reference}
        </p>
      </PageIntro>

      <section className="bg-white py-12 md:py-16">
        <div className="tf-shell grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
          <div>
            <h2 className="tf-display text-[1.4rem] text-tf-ink">What you ordered</h2>
            <ul className="mt-6 border-t border-tf-line">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 border-b border-tf-line py-4"
                >
                  <div className="min-w-0">
                    <p className="font-display text-[1rem] font-bold text-tf-ink">
                      {item.productName}
                    </p>
                    <p className="mt-1 text-[0.84rem] text-tf-steel">
                      {item.kind === "bundle"
                        ? `Kit mix · ${item.quantity} ${item.quantity === 1 ? "kit" : "kits"}`
                        : `${item.colourName} · Size ${item.size} · Qty ${item.quantity}`}
                      {item.logoKey ? " · Logo applied" : ""}
                      {item.material ? ` · ${item.material}` : ""}
                    </p>
                    {item.kind === "product" && item.logoKey && (item.frontLogo || item.backLogo) ? (
                      <p className="mt-1 text-[0.8rem] text-tf-steel">
                        {[
                          storedSpot(item.frontLogo) ? `Front: ${storedSpot(item.frontLogo)}` : null,
                          storedSpot(item.backLogo) ? `Back: ${storedSpot(item.backLogo)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    <ItemDecoration item={item} />
                    {item.kind === "bundle" && item.logoKey && kitGarments(item.kitConfig).length ? (
                      <KitPlacementSummary
                        garments={kitGarments(item.kitConfig)}
                        logoUrl={signed[item.logoKey] ?? null}
                      />
                    ) : null}
                  </div>
                  <p className="font-display text-[1rem] font-bold text-tf-ink">
                    {formatAUD(item.lineTotal)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <StoredOrderTotals order={row} />
            </div>

            <div className="mt-8 grid gap-3 border border-tf-line bg-tf-paper p-5 text-[0.88rem]">
              <div className="flex justify-between gap-4">
                <span className="text-tf-steel">Order status</span>
                <span className="font-semibold text-tf-ink">{row.status.replace(/_/g, " ")}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-tf-steel">Payment status</span>
                <span className="font-semibold text-tf-ink">{row.paymentStatus}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-tf-steel">Payment provider</span>
                <span className="font-semibold text-tf-ink">
                  {providerName(row.paymentProvider) ?? (notConfigured ? "Not connected" : "eWAY")}
                </span>
              </div>
              {paid && row.paymentTransactionId ? (
                <div className="flex justify-between gap-4">
                  <span className="text-tf-steel">eWAY transaction</span>
                  <span data-testid="transaction-id" className="font-semibold text-tf-ink">
                    {row.paymentTransactionId}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="text-tf-steel">Contact email</span>
                <span className="font-semibold text-tf-ink">{row.email}</span>
              </div>
            </div>

            {refreshed && !paid && !declined && !wasCancelled && row.paymentProvider ? (
              <p className="mt-4 text-[0.82rem] text-tf-steel">
                We checked with eWAY — it hasn't confirmed a payment for this order yet.
              </p>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div
              data-payment-state={
                paid ? "paid" : checking ? "checking" : declined ? "declined" : wasCancelled ? "cancelled" : "unpaid"
              }
              className={
                paid
                  ? "border border-tf-navy/30 bg-tf-navy p-6 text-white"
                  : "border border-tf-line bg-tf-paper p-6"
              }
            >
              {paid ? (
                <>
                  <h2 className="flex items-center gap-2 font-display text-[1.15rem] font-bold text-white">
                    <Check className="size-5 text-tf-yellow" aria-hidden /> Payment confirmed
                  </h2>
                  <p className="mt-3 text-[0.88rem] leading-relaxed text-white/75">
                    {formatAUD(row.total)} paid by card through {providerName(row.paymentProvider) ?? "eWAY"}
                    {sandbox ? " (sandbox test — no real money moved)" : ""}. Verified with the
                    gateway by our server.
                  </p>
                </>
              ) : checking ? (
                <>
                  <h2 className="flex items-center gap-2 font-display text-[1.15rem] font-bold text-tf-ink">
                    <Loader2 className="size-5 animate-spin text-tf-navy" aria-hidden /> Checking payment…
                  </h2>
                  <p className="mt-3 text-[0.88rem] leading-relaxed text-tf-steel">
                    Confirming the result with eWAY. This takes a few seconds.
                  </p>
                </>
              ) : declined || wasCancelled ? (
                <div>
                  <h2 className="flex items-center gap-2 font-display text-[1.15rem] font-bold text-tf-ink">
                    <XCircle className="size-5 text-tf-rust" aria-hidden />{" "}
                    {declined ? "Payment didn't go through" : "Payment cancelled"}
                  </h2>
                  <p className="mt-3 text-[0.88rem] leading-relaxed text-tf-steel">
                    {declined
                      ? (verified?.message ?? "The card was declined.")
                      : "You left the eWAY payment page before paying."}{" "}
                    Nothing has been charged and the order is <strong className="text-tf-ink">not paid</strong>.
                    It's saved with every line, so you can pay for this same order again.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="flex items-center gap-2 font-display text-[1.15rem] font-bold text-tf-ink">
                    <Clock className="size-5 text-tf-rust" aria-hidden /> Awaiting payment
                  </h2>
                  <p className="mt-3 text-[0.88rem] leading-relaxed text-tf-steel">
                    Nothing has been charged. Your order is saved with every line, colour, size and
                    logo, so we can pick it straight up once payment is sorted.
                  </p>
                  {notConfigured ? (
                    <p className="mt-4 flex gap-2.5 border border-tf-orange/50 bg-tf-orange/10 px-3 py-3 text-[0.82rem] leading-relaxed text-tf-ink">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
                      <span>
                        Card payments are not connected on this build — the server is missing{" "}
                        <code className="font-semibold">
                          {(payment.data?.missing ?? ["EWAY_API_KEY", "EWAY_PASSWORD"]).join(", ")}
                        </code>
                        . No payment can complete until eWAY is configured.
                      </span>
                    </p>
                  ) : null}
                </>
              )}

              {retryError ? (
                <p role="alert" className="mt-4 text-[0.82rem] text-tf-rust">
                  {retryError}
                </p>
              ) : null}
              <div className="mt-6 flex flex-col gap-3">
                {canRetry ? (
                  <button
                    type="button"
                    data-testid="pay-again"
                    className="btn-base btn-primary justify-center"
                    disabled={retry.isPending}
                    onClick={payAgain}
                  >
                    {retry.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <CreditCard className="size-4" aria-hidden />
                    )}{" "}
                    Pay {formatAUD(row.total)} with eWAY
                  </button>
                ) : null}
                {!paid ? (
                  <Link
                    to="/contact"
                    className={`btn-base justify-center ${canRetry ? "btn-secondary text-tf-navy" : "btn-primary"}`}
                  >
                    <span>Sort payment with us</span> <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
                <Link
                  to="/shop"
                  className="btn-base btn-secondary justify-center text-tf-navy"
                >
                  <span>Keep shopping</span>
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
