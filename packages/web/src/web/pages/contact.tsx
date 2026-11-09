import { useEffect, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { AlertCircle, Check, Loader2, Mail, Phone, ShieldCheck, Truck } from "lucide-react";
import { PageIntro } from "../components/layout";
import { Reveal } from "../components/reveal";
import { useSubmitContact } from "../queries/contact";
import { SITE_CONTACT } from "../lib/site";

interface Errors {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}

/** Turn a failed mutation into the tail of "We couldn't send that — …". */
function failureReason(err: unknown) {
  const raw = err instanceof Error ? err.message.trim() : "";
  if (!raw || /fetch|network|load failed/i.test(raw)) return "the connection dropped before it reached us";
  if (/validation/i.test(raw)) return "some of the details didn't pass our checks";
  const reason = raw.replace(/\.$/, "");
  return reason.charAt(0).toLowerCase() + reason.slice(1);
}

const POINTS = [
  {
    icon: Truck,
    title: "Australian owned",
    body: "Owned and run here. Every order is handled by people who know the trades.",
  },
  {
    icon: ShieldCheck,
    title: "Secure hosted checkout",
    body: "Card details are handled by our payment provider. We never see them.",
  },
];

export default function ContactPage() {
  const submit = useSubmitContact();
  const search = useSearch();
  // The Design Studio links here with a pre-written quote request (?message=...).
  const [form, setForm] = useState(() => ({
    name: "",
    email: "",
    company: "",
    phone: "",
    message: (new URLSearchParams(search).get("message") ?? "").slice(0, 2000),
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [website, setWebsite] = useState(""); // honeypot
  const startedAt = useRef<number>(Date.now());
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const validate = () => {
    const next: Errors = {};
    if (form.name.trim().length < 2) next.name = "Tell us your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      next.email = "Enter a valid email address.";
    if (form.phone.trim() && !/^[+\d\s()-]{6,40}$/.test(form.phone.trim()))
      next.phone = "Use digits, spaces, + ( ) or - only.";
    if (form.message.trim().length < 10) next.message = "Give us a bit more detail.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    submit.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || null,
      phone: form.phone.trim() || null,
      message: form.message.trim(),
      website: website || null,
      startedAt: startedAt.current,
    });
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
      if (errors[key as keyof Errors]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
  });

  return (
    <>
      <PageIntro
        title={
          <>
            Need a hand?
            <br />
            Say g&rsquo;day.
          </>
        }
        intro="Orders go through the shop. For custom crew sizes, bulk quotes or logo questions — drop a line."
      />

      <section className="bg-white py-[clamp(3.5rem,7vw,6rem)]">
        <div className="tf-shell grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          {/* ---------- Form ---------- */}
          <Reveal>
            {submit.isSuccess ? (
              <div className="border border-tf-navy bg-tf-paper p-8 md:p-10">
                <span className="grid size-12 place-items-center bg-tf-navy text-tf-yellow">
                  <Check className="size-6" aria-hidden />
                </span>
                <h2 className="tf-display mt-6 text-[clamp(1.5rem,3.4vw,2.2rem)] text-tf-ink">
                  Message sent.
                </h2>
                <p className="mt-4 text-[0.98rem] leading-relaxed text-tf-steel">
                  Your enquiry has been emailed to our team at {SITE_CONTACT.email}
                  {submit.data?.id ? (
                    <>
                      , reference{" "}
                      <span className="font-display font-bold text-tf-navy">#{submit.data.id}</span>
                    </>
                  ) : null}
                  . A person will reply to{" "}
                  <span className="font-semibold text-tf-ink">{form.email}</span>.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link to="/bundle-deals" className="btn-base btn-primary">
                    Build your bundle
                  </Link>
                  <button
                    type="button"
                    className="btn-base btn-secondary text-tf-navy hover:text-tf-navy"
                    onClick={() => {
                      submit.reset();
                      startedAt.current = Date.now();
                      setForm({ name: "", email: "", company: "", phone: "", message: "" });
                    }}
                  >
                    <span>Send another</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate className="border border-tf-line bg-white p-7 md:p-9">
                <h2 className="tf-display text-[1.4rem] text-tf-ink">Send us a message</h2>
                <p className="mt-2 text-[0.9rem] text-tf-steel">
                  We&apos;ll reply to your email. Fields marked with an asterisk are required.
                </p>

                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="tf-eyebrow block text-tf-steel">Name *</span>
                    <input
                      {...field("name")}
                      aria-label="Name"
                      aria-invalid={Boolean(errors.name)}
                      autoComplete="name"
                      className="tf-input mt-2"
                    />
                    {errors.name ? (
                      <span className="mt-1.5 block text-[0.8rem] text-tf-rust">{errors.name}</span>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className="tf-eyebrow block text-tf-steel">Email *</span>
                    <input
                      {...field("email")}
                      aria-label="Email"
                      aria-invalid={Boolean(errors.email)}
                      type="email"
                      autoComplete="email"
                      className="tf-input mt-2"
                    />
                    {errors.email ? (
                      <span className="mt-1.5 block text-[0.8rem] text-tf-rust">{errors.email}</span>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className="tf-eyebrow block text-tf-steel">Phone (optional)</span>
                    <input
                      {...field("phone")}
                      aria-label="Phone"
                      aria-invalid={Boolean(errors.phone)}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={40}
                      className="tf-input mt-2"
                    />
                    {errors.phone ? (
                      <span className="mt-1.5 block text-[0.8rem] text-tf-rust">{errors.phone}</span>
                    ) : null}
                  </label>

                  <label className="block">
                    <span className="tf-eyebrow block text-tf-steel">Company (optional)</span>
                    <input
                      {...field("company")}
                      aria-label="Company"
                      autoComplete="organization"
                      maxLength={120}
                      className="tf-input mt-2"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="tf-eyebrow block text-tf-steel">Message *</span>
                    <textarea
                      {...field("message")}
                      aria-label="Message"
                      aria-invalid={Boolean(errors.message)}
                      rows={7}
                      maxLength={4000}
                      placeholder="Crew size, garments you're after, logo files, timeline…"
                      className="tf-input mt-2 resize-y"
                    />
                    {errors.message ? (
                      <span className="mt-1.5 block text-[0.8rem] text-tf-rust">
                        {errors.message}
                      </span>
                    ) : null}
                  </label>
                </div>

                {/* Honeypot — hidden from people, tempting to bots. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                  <label htmlFor="contact-website">Website</label>
                  <input
                    id="contact-website"
                    aria-label="Website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                {submit.isError ? (
                  <p role="alert" className="mt-6 flex items-start gap-2 border border-tf-orange/50 bg-tf-orange/5 px-4 py-3 text-[0.88rem] text-tf-ink">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
                    <span>
                      We couldn&apos;t send that — {failureReason(submit.error)}. Try again, or email{" "}
                      <a href={`mailto:${SITE_CONTACT.email}`} className="font-semibold underline underline-offset-2">
                        {SITE_CONTACT.email}
                      </a>{" "}
                      or call{" "}
                      <a href={SITE_CONTACT.phoneHref} className="font-semibold whitespace-nowrap underline underline-offset-2">
                        {SITE_CONTACT.phoneDisplay}
                      </a>
                      .
                    </span>
                  </p>
                ) : null}

                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <button type="submit" className="btn-base btn-primary" disabled={submit.isPending}>
                    {submit.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden /> Sending…
                      </>
                    ) : (
                      "Send message"
                    )}
                  </button>
                  <p className="text-[0.78rem] text-tf-steel">
                    Sent straight to our inbox. We don&apos;t share your details.
                  </p>
                </div>
              </form>
            )}
          </Reveal>

          {/* ---------- What to expect ---------- */}
          <Reveal delay={80}>
            <div className="border border-tf-navy bg-tf-navy p-6 text-white md:p-7">
              <h2 className="tf-display text-[1.25rem]">Rather call or email?</h2>
              <ul className="mt-4 space-y-1">
                <li>
                  <a
                    href={`mailto:${SITE_CONTACT.email}`}
                    className="-mx-2 inline-flex min-h-11 items-center gap-3 rounded-md px-2 font-medium transition-colors hover:text-tf-yellow"
                  >
                    <Mail className="size-5 shrink-0 text-tf-yellow" aria-hidden />
                    <span className="break-all">{SITE_CONTACT.email}</span>
                  </a>
                </li>
                <li>
                  <a
                    href={SITE_CONTACT.phoneHref}
                    className="-mx-2 inline-flex min-h-11 items-center gap-3 rounded-md px-2 font-medium tabular-nums transition-colors hover:text-tf-yellow"
                  >
                    <Phone className="size-5 shrink-0 text-tf-yellow" aria-hidden />
                    {SITE_CONTACT.phoneDisplay}
                  </a>
                </li>
              </ul>
            </div>

            <ul className="mt-8 divide-y divide-tf-line border-y border-tf-line">
              {POINTS.map((point) => (
                <li key={point.title} className="flex gap-5 py-6">
                  <point.icon className="mt-0.5 size-6 shrink-0 text-tf-rust" aria-hidden />
                  <div>
                    <h3 className="font-display text-[0.95rem] font-bold tracking-[0.02em] text-tf-navy uppercase">
                      {point.title}
                    </h3>
                    <p className="mt-1.5 text-[0.92rem] leading-relaxed text-tf-steel">
                      {point.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 bg-tf-paper p-6">
              <h3 className="tf-display text-[1.05rem] text-tf-ink">Kitting a big crew?</h3>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-tf-steel">
                Tell us the headcount, the trades and the deadline. We&apos;ll come back with a pack
                recommendation and a real lead time.
              </p>
              <Link
                to="/bundle-deals"
                className="mt-5 inline-flex items-center gap-2 font-display text-[0.8rem] font-bold tracking-[0.1em] text-tf-navy uppercase underline decoration-tf-yellow decoration-2 underline-offset-4"
              >
                See the packs
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
