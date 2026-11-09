import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { formatKg } from "../../../shared/shipping";
import { authClient } from "../../lib/auth";
import { setDelivery, useDelivery } from "../../lib/delivery";
import { type OrderLineInput, useRequestShippingQuote } from "../../queries/orders";

export const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;
export type AuState = (typeof AU_STATES)[number];

export interface SubmittedQuote {
  reference: string;
  email: string;
  weightGrams: number;
  pieces: number;
  /** Cart + postcode the request was made for — a changed cart needs a new request. */
  signature: string;
}

/* ---------- the last request, remembered per cart so cart and checkout agree ---------- */

const KEY = "tradieforms.shipping-quote.v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: SubmittedQuote | null } = { raw: null, value: null };

function read(): SubmittedQuote | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === cache.raw) return cache.value;
  let value: SubmittedQuote | null = null;
  try {
    value = raw ? (JSON.parse(raw) as SubmittedQuote) : null;
  } catch {
    value = null;
  }
  cache = { raw, value };
  return value;
}

function remember(q: SubmittedQuote) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}

export function quoteSignature(lines: OrderLineInput[], postcode: string) {
  return JSON.stringify([postcode, lines]);
}

/** The request already sent for exactly this cart and postcode, if any. */
export function useSubmittedQuote(lines: OrderLineInput[], postcode: string) {
  const saved = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read,
    () => null,
  );
  return saved && saved.signature === quoteSignature(lines, postcode) ? saved : null;
}

/** Sends a request and remembers it for this cart. */
export function useSendShippingQuote(lines: OrderLineInput[]) {
  const mutation = useRequestShippingQuote();
  const delivery = useDelivery();
  async function send(input: {
    contact: { name: string; email: string; phone?: string | null; company?: string | null };
    delivery: { address1?: string | null; suburb: string; state: AuState };
    notes?: string | null;
  }) {
    const result = await mutation.mutateAsync({
      ...input,
      delivery: { ...input.delivery, postcode: delivery.postcode, zone: delivery.zone },
      lines,
    });
    remember({
      reference: result.reference,
      email: result.email,
      weightGrams: result.weightGrams,
      pieces: result.pieces,
      signature: quoteSignature(lines, delivery.postcode),
    });
    return result;
  }
  return { send, isPending: mutation.isPending };
}

/* ---------- confirmation ---------- */

export function QuoteRequestConfirmation({ submitted }: { submitted: SubmittedQuote }) {
  return (
    <output
      className="mt-4 block border border-tf-navy/40 bg-tf-navy/[0.06] px-4 py-4 text-[0.85rem] leading-relaxed text-tf-ink"
      data-testid="ship-quote-sent"
    >
      <p className="flex items-center gap-2 font-display text-[0.95rem] font-bold text-tf-navy">
        <CheckCircle2 className="size-4.5" aria-hidden /> Shipping quote requested
      </p>
      <p className="mt-1.5">
        Reference <strong data-testid="ship-quote-ref">{submitted.reference}</strong> ·{" "}
        {submitted.pieces} garments · {formatKg(submitted.weightGrams)}.
      </p>
      <p className="mt-1.5 text-tf-steel">
        We&apos;ll work out the freight and email your quote to{" "}
        <strong className="text-tf-ink">{submitted.email}</strong>, usually within one business day.
        Your cart stays saved in this browser — once you have the quote we&apos;ll help you finish the
        order.
      </p>
    </output>
  );
}

/* ---------- the cart form ---------- */

const label =
  "mb-1 block font-display text-[0.72rem] font-bold tracking-[0.06em] text-tf-ink uppercase";

/**
 * Cart: the cart is over the 30 kg shipping table, so instead of "Checkout" the customer
 * sends us the cart, weight, delivery area and contact details for a freight quote.
 */
export function ShippingQuoteRequest({ lines }: { lines: OrderLineInput[] }) {
  const delivery = useDelivery();
  const { data: session } = authClient.useSession();
  const submitted = useSubmittedQuote(lines, delivery.postcode);
  const { send, isPending } = useSendShippingQuote(lines);
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", suburb: "", state: "" as AuState | "", notes: "" });

  const sessionName = session?.user?.name ?? "";
  const sessionEmail = session?.user?.email ?? "";
  useEffect(() => {
    if (!sessionName && !sessionEmail) return;
    setF((p) => ({
      ...p,
      name: p.name || (sessionName.includes("@") ? "" : sessionName),
      email: p.email || sessionEmail,
    }));
  }, [sessionName, sessionEmail]);

  if (submitted) return <QuoteRequestConfirmation submitted={submitted} />;

  const errors = {
    name: f.name.trim().length < 2 ? "Enter your name." : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) ? null : "Enter a valid email address.",
    phone: /^[+\d\s()-]*$/.test(f.phone) ? null : "Enter a valid phone number.",
    postcode: /^\d{4}$/.test(delivery.postcode) ? null : "Enter the delivery postcode.",
    suburb: f.suburb.trim().length < 2 ? "Enter the suburb or town." : null,
    state: f.state ? null : "Choose the state.",
  };
  const valid = Object.values(errors).every((e) => !e);
  const err = (k: keyof typeof errors) =>
    touched && errors[k] ? <p className="mt-1 text-[0.75rem] text-tf-rust">{errors[k]}</p> : null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFailure(null);
    if (!valid) return;
    try {
      await send({
        contact: { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || null, company: f.company.trim() || null },
        delivery: { suburb: f.suburb.trim(), state: f.state as AuState },
        notes: f.notes.trim() || null,
      });
    } catch (e2) {
      setFailure((e2 as { message?: string })?.message ?? "We couldn't send that request. Please try again.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-base btn-primary mt-5 w-full"
        onClick={() => setOpen(true)}
        data-testid="ship-quote-open"
      >
        Request a shipping quote <Send className="size-4" aria-hidden />
      </button>
    );
  }

  return (
    <form
      id="ship-quote-request"
      onSubmit={submit}
      noValidate
      className="mt-5 border border-tf-line bg-white p-4"
      data-testid="ship-quote-form"
    >
      <h3 className="font-display text-[1rem] font-bold text-tf-ink">Request a shipping quote</h3>
      <p className="mt-1 text-[0.8rem] leading-relaxed text-tf-steel">
        We&apos;ll send this cart, its weight and your delivery area to our team and email you a
        freight quote. Nothing is charged.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div>
          <label htmlFor="sq-name" className={label}>Name</label>
          <input id="sq-name" aria-label="Name" className="tf-input" autoComplete="name" value={f.name} onChange={set("name")} aria-invalid={Boolean(touched && errors.name)} />
          {err("name")}
        </div>
        <div>
          <label htmlFor="sq-email" className={label}>Email</label>
          <input id="sq-email" aria-label="Email" type="email" className="tf-input" autoComplete="email" value={f.email} onChange={set("email")} aria-invalid={Boolean(touched && errors.email)} />
          {err("email")}
        </div>
        <div>
          <label htmlFor="sq-phone" className={label}>Phone (optional)</label>
          <input id="sq-phone" aria-label="Phone (optional)" type="tel" className="tf-input" autoComplete="tel" value={f.phone} onChange={set("phone")} aria-invalid={Boolean(touched && errors.phone)} />
          {err("phone")}
        </div>
        <div>
          <label htmlFor="sq-company" className={label}>Business (optional)</label>
          <input id="sq-company" aria-label="Business (optional)" className="tf-input" autoComplete="organization" value={f.company} onChange={set("company")} />
        </div>
        <div>
          <label htmlFor="sq-suburb" className={label}>Suburb / town</label>
          <input id="sq-suburb" aria-label="Suburb or town" className="tf-input" autoComplete="address-level2" value={f.suburb} onChange={set("suburb")} aria-invalid={Boolean(touched && errors.suburb)} />
          {err("suburb")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sq-state" className={label}>State</label>
            <select id="sq-state" aria-label="State" className="tf-input" value={f.state} onChange={set("state")} aria-invalid={Boolean(touched && errors.state)}>
              <option value="">—</option>
              {AU_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {err("state")}
          </div>
          <div>
            <label htmlFor="sq-postcode" className={label}>Postcode</label>
            <input
              id="sq-postcode" aria-label="Postcode"
              inputMode="numeric"
              maxLength={4}
              className="tf-input"
              autoComplete="postal-code"
              value={delivery.postcode}
              onChange={(e) => setDelivery({ postcode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              aria-invalid={Boolean(touched && errors.postcode)}
            />
            {err("postcode")}
          </div>
        </div>
        <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
          <label htmlFor="sq-notes" className={label}>Notes (optional)</label>
          <textarea id="sq-notes" aria-label="Notes (optional)" rows={2} className="tf-input" placeholder="Delivery deadline, site access, pallet OK…" value={f.notes} onChange={set("notes")} />
        </div>
      </div>
      {failure ? (
        <p className="mt-3 border border-tf-orange/50 bg-tf-orange/10 px-3 py-2 text-[0.8rem] text-tf-ink" role="alert">
          {failure}
        </p>
      ) : null}
      <button type="submit" className="btn-base btn-primary mt-4 w-full" disabled={isPending} data-testid="ship-quote-submit">
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> Sending…
          </>
        ) : (
          <>
            Send quote request <Send className="size-4" aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
