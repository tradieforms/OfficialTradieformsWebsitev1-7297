import { Loader2, Mail, MailWarning } from "lucide-react";
import { formatAUD } from "../../../shared/catalogue";
import { formatKg } from "../../../shared/shipping";
import { useAdminShippingQuotes } from "../../queries/admin";

function when(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** Admin: carts over 30 kg waiting on a freight quote. Stored even when email isn't set up. */
export function ShippingQuoteList() {
  const quotes = useAdminShippingQuotes(true);
  const rows = quotes.data ?? [];

  return (
    <section className="border-t border-tf-line bg-tf-paper py-[clamp(3rem,6vw,5rem)]" data-admin-quotes>
      <div className="tf-shell">
        <h2 className="tf-display text-[1.6rem] text-tf-ink">Shipping quote requests</h2>
        <p className="mt-1.5 max-w-2xl text-[0.9rem] leading-relaxed text-tf-steel">
          Carts over the 30 kg shipping table. Reply to the customer by email with the freight cost.
        </p>

        {quotes.isLoading ? (
          <div className="mt-6 flex items-center gap-3 text-sm text-tf-steel">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading requests…
          </div>
        ) : quotes.isError ? (
          <p className="mt-6 text-sm text-tf-rust">Couldn&apos;t load quote requests. Refresh to try again.</p>
        ) : rows.length === 0 ? (
          <div className="mt-6 border border-tf-line bg-white p-8 text-[0.92rem] text-tf-steel">
            No shipping quote requests yet.
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {rows.map((q) => (
              <li key={q.reference} className="border border-tf-line bg-white p-5" data-admin-quote={q.reference}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <p className="font-display text-[1rem] font-bold text-tf-navy">{q.reference}</p>
                  <p className="text-[0.8rem] text-tf-steel">{when(q.createdAt as unknown as string)}</p>
                </div>
                <div className="mt-3 grid gap-4 text-[0.85rem] md:grid-cols-[1fr_1fr_1.4fr]">
                  <div>
                    <p className="font-semibold text-tf-ink">{q.name}</p>
                    {q.company ? <p className="text-tf-steel">{q.company}</p> : null}
                    <a href={`mailto:${q.email}?subject=Shipping quote ${q.reference}`} className="text-tf-navy underline-offset-2 hover:underline">
                      {q.email}
                    </a>
                    {q.phone ? <p className="text-tf-steel">{q.phone}</p> : null}
                    <p className="mt-2 flex items-center gap-1.5 text-[0.75rem] text-tf-steel">
                      {q.deliveryStatus === "sent" ? (
                        <>
                          <Mail className="size-3.5" aria-hidden /> Emailed to the inbox
                        </>
                      ) : (
                        <>
                          <MailWarning className="size-3.5 text-tf-rust" aria-hidden />
                          {q.deliveryStatus === "not_configured" ? "Not emailed — email isn't set up" : "Email failed — see here"}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-tf-steel">
                    <p className="text-tf-ink">
                      {[q.address1, q.suburb, q.state, q.postcode].filter(Boolean).join(", ")}
                    </p>
                    <p>
                      {q.zone ?? "—"}
                      {q.zoneOverride ? " (set by customer)" : ""}
                    </p>
                    <p className="mt-1 font-semibold text-tf-ink" data-admin-quote-weight>
                      {formatKg(q.weightGrams)} · {q.pieces} garments
                    </p>
                    <p>
                      Garments {formatAUD(q.subtotal)}
                      {q.embroideryFee ? ` · Embroidery ${formatAUD(q.embroideryFee)}` : ""}
                    </p>
                  </div>
                  <div>
                    <ul className="space-y-1 text-tf-ink">
                      {q.lines.map((l, i) => (
                        <li key={i}>
                          {l.quantity}× {l.productName} — {l.colourName}
                          {l.kind === "product" ? ` ${l.size}` : ""}
                          {l.decorationMethod ? <span className="text-tf-steel"> · {l.decorationMethod}</span> : null}
                        </li>
                      ))}
                    </ul>
                    {q.notes ? <p className="mt-2 text-tf-steel">“{q.notes}”</p> : null}
                    {q.flags.map((f) => (
                      <p key={f} className="mt-1 text-[0.75rem] text-tf-rust">{f}</p>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
