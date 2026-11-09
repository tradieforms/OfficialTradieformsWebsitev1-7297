import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Loader2, Lock, Send, ShieldAlert } from "lucide-react";
import { formatAUD } from "../../shared/catalogue";
import { PageIntro } from "../components/layout";
import { authClient } from "../lib/auth";
import { useCart } from "../lib/cart";
import { checkoutKeyFor, forgetCheckoutKey } from "../lib/checkout-key";
import { toOrderLines, useCreateOrder, usePaymentStatus, useQuote, useStartPayment } from "../queries/orders";
import { setDelivery, useDelivery } from "../lib/delivery";
import {
  LineDecoration,
  OrderTotals,
  SHIPPING_SOURCE_NOTE,
  ShippingPostcode,
} from "../components/order/order-summary";
import {
  QuoteRequestConfirmation,
  useSendShippingQuote,
  useSubmittedQuote,
} from "../components/order/shipping-quote-request";

const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;
type AuState = (typeof STATES)[number];

interface FormState {
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
  address1: string;
  address2: string;
  suburb: string;
  state: AuState | "";
}

export default function CheckoutPage() {
  const cart = useCart();
  const [, navigate] = useLocation();
  const { data: session } = authClient.useSession();
  const payment = usePaymentStatus();
  const createOrder = useCreateOrder();
  const startPayment = useStartPayment();

  const orderLines = useMemo(() => toOrderLines(cart.lines), [cart.lines]);
  const delivery = useDelivery();
  const quote = useQuote(orderLines, delivery);
  const ship = quote.data?.shipping;

  const [form, setForm] = useState<FormState>({
    name: session?.user?.name ?? "",
    company: "",
    email: session?.user?.email ?? "",
    phone: "",
    notes: "",
    address1: "",
    address2: "",
    suburb: "",
    state: "",
  });
  // The session often resolves after the first render (e.g. straight after Google sign-in), so
  // fill name/email when it arrives — without overwriting anything the customer has typed.
  const sessionName = session?.user?.name ?? "";
  const sessionEmail = session?.user?.email ?? "";
  useEffect(() => {
    if (!sessionName && !sessionEmail) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || (sessionName.includes("@") ? "" : sessionName),
      email: prev.email || sessionEmail,
    }));
  }, [sessionName, sessionEmail]);
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // A freight quote only needs the delivery area, so the street address is optional there.
  const customQuoteNow = ship?.status === "custom_quote";
  const errors = {
    name: form.name.trim().length < 2 ? "Enter the name for the order." : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
      ? null
      : "Enter a valid email address.",
    address1: form.address1.trim().length < 3 && !customQuoteNow ? "Enter the delivery street address." : null,
    suburb: form.suburb.trim().length < 2 ? "Enter the suburb or town." : null,
    state: form.state ? null : "Choose the state or territory.",
    postcode: /^\d{4}$/.test(delivery.postcode) && ship?.postcode
      ? null
      : "Enter a valid 4-digit Australian postcode.",
  };
  const shippingReady = ship?.status === "ok";
  const customQuote = customQuoteNow;
  const valid = Object.values(errors).every((v) => !v);
  const submittedQuote = useSubmittedQuote(orderLines, delivery.postcode);
  const shippingQuote = useSendShippingQuote(orderLines);

  const total = quote.data?.total ?? cart.subtotal;
  const busy = createOrder.isPending || startPayment.isPending || shippingQuote.isPending;

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFailure(null);
    if (customQuote) {
      // Over the shipping table: send the cart + details to the team for a freight quote.
      if (!valid || submittedQuote || quote.isFetching) return;
      try {
        await shippingQuote.send({
          contact: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || null,
            company: form.company.trim() || null,
          },
          delivery: {
            address1: [form.address1.trim(), form.address2.trim()].filter(Boolean).join(", ") || null,
            suburb: form.suburb.trim(),
            state: form.state as AuState,
          },
          notes: form.notes.trim() || null,
        });
      } catch (err) {
        setFailure((err as { message?: string })?.message ?? "We couldn't send that request. Please try again.");
      }
      return;
    }
    if (!valid || orderLines.length === 0 || !shippingReady || quote.isFetching) return;

    try {
      const order = await createOrder.mutateAsync({
        customer: {
          name: form.name.trim(),
          company: form.company.trim() || null,
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          notes: form.notes.trim() || null,
        },
        // Only the address, postcode and optional zone correction are sent — the server
        // recomputes weight, zone and charge itself.
        shipping: {
          address1: form.address1.trim(),
          address2: form.address2.trim() || null,
          suburb: form.suburb.trim(),
          state: form.state as AuState,
          postcode: delivery.postcode,
          zone: delivery.zone,
        },
        lines: orderLines,
        // Same key for every resubmit of this cart + details → the server returns the same order.
        checkoutKey: checkoutKeyFor(JSON.stringify({ orderLines, form, delivery })),
      });

      // The order is persisted with every line. The card is entered on eWAY's hosted page
      // (never on this site); when eWAY isn't configured we send the customer to the order
      // page and say plainly that payment is not connected.
      const result = await startPayment.mutateAsync({
        reference: order.reference,
        token: order.accessToken,
      });
      cart.clearCart();
      forgetCheckoutKey();

      if (result.configured && "url" in result && result.url) {
        window.location.href = result.url;
        return;
      }
      navigate(
        `/checkout/success?ref=${encodeURIComponent(order.reference)}&t=${encodeURIComponent(order.accessToken)}`,
      );
    } catch (err) {
      const message =
        (err as { message?: string })?.message ??
        "We couldn't save that order. Nothing has been charged — please try again.";
      setFailure(message);
    }
  }

  if (cart.lines.length === 0 && !busy) {
    return (
      <>
        <PageIntro
          title="Your cart is empty."
          intro="Add a garment or a bundle first — checkout keeps every colour, size and logo with the line."
        />
        <div className="tf-shell py-16">
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
        title="Send it to the crew."
        intro="We use these details to confirm stock, sizes and artwork before anything is produced."
      />

      <section className="bg-white py-12 md:py-16">
        <div className="tf-shell grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-14">
          <form onSubmit={submit} noValidate className="order-2 lg:order-1">
            <h2 className="tf-display text-[1.4rem] text-tf-ink">Your details</h2>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label htmlFor="co-name" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  Name *
                </label>
                <input
                  id="co-name"
                  className="tf-input"
                  aria-label="Name"
                  value={form.name}
                  onChange={set("name")}
                  aria-invalid={Boolean(touched && errors.name)}
                  aria-describedby={touched && errors.name ? "co-name-error" : undefined}
                  autoComplete="name"
                />
                {touched && errors.name ? (
                  <p id="co-name-error" className="mt-1.5 text-[0.8rem] text-tf-rust">
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="co-company" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  Business
                </label>
                <input
                  id="co-company"
                  className="tf-input"
                  aria-label="Business name"
                  value={form.company}
                  onChange={set("company")}
                  autoComplete="organization"
                />
              </div>

              <div>
                <label htmlFor="co-email" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  Email *
                </label>
                <input
                  id="co-email"
                  type="email"
                  className="tf-input"
                  aria-label="Email address"
                  value={form.email}
                  onChange={set("email")}
                  aria-invalid={Boolean(touched && errors.email)}
                  aria-describedby={touched && errors.email ? "co-email-error" : undefined}
                  autoComplete="email"
                />
                {touched && errors.email ? (
                  <p id="co-email-error" className="mt-1.5 text-[0.8rem] text-tf-rust">
                    {errors.email}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="co-phone" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  Phone
                </label>
                <input
                  id="co-phone"
                  type="tel"
                  className="tf-input"
                  aria-label="Phone number"
                  value={form.phone}
                  onChange={set("phone")}
                  autoComplete="tel"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="co-notes" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  Anything we should know
                </label>
                <textarea
                  id="co-notes"
                  rows={4}
                  className="tf-input"
                  aria-label="Anything we should know"
                  placeholder="Delivery site, deadline, logo files, names and numbers per garment…"
                  value={form.notes}
                  onChange={set("notes")}
                />
              </div>
            </div>

            <h2 className="tf-display mt-10 text-[1.4rem] text-tf-ink">Delivery address</h2>
            <p className="mt-1.5 text-[0.85rem] text-tf-steel">Australia only. Shipping is charged by total weight and postcode.</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="co-address1" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  Street address {customQuoteNow ? "(optional for a quote)" : "*"}
                </label>
                <input
                  id="co-address1"
                  aria-label="Street address"
                  className="tf-input"
                  value={form.address1}
                  onChange={set("address1")}
                  aria-invalid={Boolean(touched && errors.address1)}
                  autoComplete="address-line1"
                />
                {touched && errors.address1 ? (
                  <p className="mt-1.5 text-[0.8rem] text-tf-rust">{errors.address1}</p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="co-address2" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  Unit, building, site (optional)
                </label>
                <input
                  id="co-address2"
                  aria-label="Unit, building, site"
                  className="tf-input"
                  value={form.address2}
                  onChange={set("address2")}
                  autoComplete="address-line2"
                />
              </div>
              <div>
                <label htmlFor="co-suburb" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                  Suburb / town *
                </label>
                <input
                  id="co-suburb"
                  aria-label="Suburb or town"
                  className="tf-input"
                  value={form.suburb}
                  onChange={set("suburb")}
                  aria-invalid={Boolean(touched && errors.suburb)}
                  autoComplete="address-level2"
                />
                {touched && errors.suburb ? (
                  <p className="mt-1.5 text-[0.8rem] text-tf-rust">{errors.suburb}</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="co-state" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                    State *
                  </label>
                  <select
                    id="co-state"
                    className="tf-input"
                    value={form.state}
                    onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value as AuState }))}
                    aria-invalid={Boolean(touched && errors.state)}
                    autoComplete="address-level1"
                  >
                    <option value="">Select</option>
                    {STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  {touched && errors.state ? (
                    <p className="mt-1.5 text-[0.8rem] text-tf-rust">{errors.state}</p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="co-postcode" className="mb-2 block font-display text-[0.82rem] font-bold tracking-[0.06em] text-tf-ink uppercase">
                    Postcode *
                  </label>
                  <input
                    id="co-postcode"
                  aria-label="Postcode"
                    inputMode="numeric"
                    maxLength={4}
                    className="tf-input"
                    value={delivery.postcode}
                    onChange={(e) => setDelivery({ postcode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    aria-invalid={Boolean(touched && errors.postcode)}
                    autoComplete="postal-code"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                {touched && errors.postcode ? (
                  <p className="mb-2 text-[0.8rem] text-tf-rust">{errors.postcode}</p>
                ) : null}
                <ShippingPostcode quote={quote.data} showInput={false} />
              </div>
            </div>

            {/* Payment state, stated honestly */}
            <div className={`mt-8 border border-tf-line bg-tf-paper p-5 ${customQuote ? "hidden" : ""}`}>
              <h3 className="flex items-center gap-2 font-display text-[0.95rem] font-bold text-tf-ink">
                <Lock className="size-4 text-tf-navy" aria-hidden /> Payment
              </h3>
              {payment.isLoading ? (
                <p className="mt-2 text-[0.88rem] text-tf-steel">Checking payment configuration…</p>
              ) : payment.data?.configured ? (
                <p className="mt-2 text-[0.88rem] leading-relaxed text-tf-steel">
                  You'll be taken to eWAY's secure payment page to pay{" "}
                  <strong className="text-tf-ink">{formatAUD(total)}</strong> in AUD (garments, embroidery and shipping). Card details
                  are entered with eWAY, never on this site. Your order is saved first, so nothing is
                  lost if you cancel.
                  {payment.data?.environment === "sandbox" ? (
                    <span data-testid="sandbox-note" className="mt-2 block font-semibold text-tf-rust">
                      Test mode: eWAY sandbox — use an eWAY test card. No real money moves.
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-2 flex gap-2.5 text-[0.88rem] leading-relaxed text-tf-steel">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
                  <span>
                    Card payments are <strong className="text-tf-ink">not connected</strong> on this
                    build — the server is missing{" "}
                    <code className="font-semibold text-tf-ink">
                      {(payment.data?.missing ?? ["EWAY_API_KEY", "EWAY_PASSWORD"]).join(", ")}
                    </code>
                    . Placing the order will save it as <strong className="text-tf-ink">awaiting
                    payment</strong>. No card will be charged and no payment will be recorded as
                    complete.
                  </span>
                </p>
              )}
            </div>

            {customQuote && submittedQuote ? (
              <QuoteRequestConfirmation submitted={submittedQuote} />
            ) : customQuote ? (
              <p
                className="mt-6 border border-tf-orange/60 bg-tf-orange/10 px-4 py-3 text-[0.88rem] leading-relaxed text-tf-ink"
                role="alert"
                data-testid="checkout-quote-note"
              >
                {ship?.message} Fill in your details above and request a shipping quote — we&apos;ll
                email you the freight cost, then help you finish the order. Nothing is charged now.
              </p>
            ) : touched && !shippingReady && valid ? (
              <p className="mt-6 text-[0.85rem] text-tf-rust">{ship?.message ?? "Calculating shipping…"}</p>
            ) : null}

            {failure ? (
              <p className="mt-6 border border-tf-orange/60 bg-tf-orange/10 px-4 py-3 text-[0.88rem] text-tf-ink">
                {failure}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {customQuote ? (
                submittedQuote ? null : (
                  <button type="submit" className="btn-base btn-primary" disabled={busy} data-testid="checkout-request-quote">
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden /> Sending request…
                      </>
                    ) : (
                      <>
                        Request a shipping quote <Send className="size-4" aria-hidden />
                      </>
                    )}
                  </button>
                )
              ) : (
              <button
                type="submit"
                className="btn-base btn-primary"
                disabled={busy}
                aria-disabled={busy || !shippingReady}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Saving order…
                  </>
                ) : (
                  <>
                    Place order <ArrowRight className="size-4" aria-hidden />
                  </>
                )}
              </button>
              )}
              <Link
                to="/cart"
                className="font-display text-[0.82rem] font-bold tracking-[0.04em] text-tf-navy uppercase hover:text-tf-rust"
              >
                ← Back to cart
              </Link>
            </div>
          </form>

          {/* ---------- What's in the order ---------- */}
          <aside className="order-1 lg:order-2 lg:sticky lg:top-28 lg:self-start">
            <div className="border border-tf-line bg-tf-paper p-6">
              <h2 className="tf-display text-[1.25rem] text-tf-ink">Your kit</h2>
              <ul className="mt-5 space-y-4">
                {cart.lines.map((line, i) => {
                  const priced = quote.data?.lines[i];
                  const unit = priced?.unitPrice ?? line.unitPrice;
                  return (
                  <li key={line.id} className="flex gap-3">
                    <span className="tf-stage size-16 shrink-0 border border-tf-line bg-white">
                      {line.image ? (
                        <img src={line.image} alt="" className="h-full w-full object-contain p-1" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.88rem] leading-snug font-semibold text-tf-ink">
                        {line.label}
                      </span>
                      <span className="block text-[0.78rem] text-tf-steel">
                        Qty {line.quantity} · {formatAUD(unit)} {line.kind === "bundle" ? "per kit" : "each"}
                      </span>
                      {line.logoKey ? <LineDecoration priced={priced} /> : null}
                    </span>
                    <span className="font-display text-[0.88rem] font-bold text-tf-ink">
                      {formatAUD(priced?.lineTotal ?? unit * line.quantity)}
                    </span>
                  </li>
                  );
                })}
              </ul>

              <div className="mt-6 border-t border-tf-line">
                <OrderTotals quote={quote.data} pieces={cart.pieces} fallbackSubtotal={cart.subtotal} />
              </div>
              <p className="mt-3 text-[0.72rem] leading-relaxed text-tf-steel">{SHIPPING_SOURCE_NOTE}</p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
