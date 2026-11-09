import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Mail, Phone } from "lucide-react";
import { useSubscribe } from "../queries/newsletter";
import { SITE_CONTACT } from "../lib/site";
import { FacebookIcon, InstagramIcon } from "./social-icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SHOP_LINKS = [
  { href: "/shop", label: "All gear" },
  { href: "/bundle-deals", label: "Bundle deals" },
  { href: "/shop?category=Outerwear", label: "Jackets & vests" },
  { href: "/design-studio", label: "Design Studio" },
  { href: "/about", label: "Our story" },
  { href: "/contact", label: "Contact" },
];

export function SiteFooter() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  const subscribe = useSubscribe();

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError("Enter a valid email address, e.g. you@company.com.au.");
      return;
    }
    setFieldError(null);
    subscribe.mutate({
      email: trimmed,
      name: name.trim() || null,
      website: website || null,
      startedAt: startedAt.current,
    });
  };

  const serverError = subscribe.isError
    ? subscribe.error instanceof Error && subscribe.error.message
      ? subscribe.error.message
      : "Something went wrong and your signup wasn't sent. Try again, or email info@tradieforms.com."
    : null;

  return (
    <footer className="tf-grit bg-tf-navy-deep text-white">
      <div className="tf-shell grid gap-12 py-16 md:grid-cols-2 md:py-20 lg:grid-cols-[1.25fr_0.8fr_1.35fr]">
        {/* Brand + direct contact */}
        <div>
          <img src="/images/brand/tradieforms-logo.png" alt="TradieForms" className="h-9 w-auto" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/70">
            Branded workwear for crews who get it done. Pick a bundle or build your own kit, upload
            your logo, see it on the gear, order online.
          </p>

          <ul className="mt-7 space-y-1 text-[0.95rem]">
            <li>
              <a
                href={`mailto:${SITE_CONTACT.email}`}
                className="group -mx-2 inline-flex min-h-11 items-center gap-3 rounded-md px-2 text-white transition-colors hover:text-tf-yellow focus-visible:text-tf-yellow"
              >
                <Mail className="size-[1.1rem] shrink-0 text-tf-yellow" aria-hidden />
                <span className="font-medium break-all">{SITE_CONTACT.email}</span>
              </a>
            </li>
            <li>
              <a
                href={SITE_CONTACT.phoneHref}
                className="group -mx-2 inline-flex min-h-11 items-center gap-3 rounded-md px-2 text-white transition-colors hover:text-tf-yellow focus-visible:text-tf-yellow"
              >
                <Phone className="size-[1.1rem] shrink-0 text-tf-yellow" aria-hidden />
                <span className="font-medium tabular-nums">{SITE_CONTACT.phoneDisplay}</span>
              </a>
            </li>
          </ul>

          <div className="mt-5 flex items-center gap-3">
            <a
              href={SITE_CONTACT.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TradieForms on Instagram (opens in a new tab)"
              title="Instagram"
              className="grid size-11 place-items-center rounded-full border border-white/20 text-white transition-colors hover:border-tf-yellow hover:bg-tf-yellow hover:text-tf-navy-deep"
            >
              <InstagramIcon className="size-5" />
            </a>
            <a
              href={SITE_CONTACT.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TradieForms on Facebook (opens in a new tab)"
              title="Facebook"
              className="grid size-11 place-items-center rounded-full border border-white/20 text-white transition-colors hover:border-tf-yellow hover:bg-tf-yellow hover:text-tf-navy-deep"
            >
              <FacebookIcon className="size-5" />
            </a>
          </div>
        </div>

        <nav aria-label="Footer">
          <h2 className="font-display text-lg font-extrabold">Shop</h2>
          <ul className="mt-4 space-y-1 text-sm">
            {SHOP_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className="inline-flex min-h-9 items-center text-white/75 transition-colors hover:text-tf-yellow"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Get Crew Deals */}
        <div className="md:col-span-2 lg:col-span-1">
          <h2 className="font-display text-lg font-extrabold">Get Crew Deals</h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">
            Seasonal bundle pricing and new gear, sent when there is something worth sending.
          </p>
          {subscribe.isSuccess ? (
            <output
              className="mt-5 flex items-start gap-3 rounded-lg border border-tf-yellow/40 bg-tf-yellow/10 p-4 text-sm"
            >
              <Check className="mt-0.5 size-4 shrink-0 text-tf-yellow" aria-hidden />
              <span>
                <span className="font-display font-bold text-tf-yellow">
                  {subscribe.data?.alreadySubscribed ? "You're already on the list." : "You're on the list."}
                </span>{" "}
                <span className="text-white/80">We&apos;ll be in touch at {subscribe.data?.email}.</span>
              </span>
            </output>
          ) : (
            <form className="mt-5 space-y-3" onSubmit={submit} noValidate>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/80" htmlFor="footer-name">
                    Name <span className="font-normal text-white/60">(optional)</span>
                  </label>
                  <input
                    id="footer-name"
                    aria-label="Name"
                    type="text"
                    autoComplete="name"
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="tf-input !border-white/25 !bg-white/10 text-white placeholder:text-white/60"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-white/80" htmlFor="footer-email">
                    Email <span aria-hidden>*</span>
                  </label>
                  <input
                    id="footer-email"
                    aria-label="Email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={200}
                    value={email}
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={fieldError ? "footer-email-error" : undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldError) setFieldError(null);
                    }}
                    placeholder="you@company.com.au"
                    className="tf-input !border-white/25 !bg-white/10 text-white placeholder:text-white/60"
                  />
                </div>
              </div>
              {/* Honeypot — hidden from people, tempting to bots. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label htmlFor="footer-website">Website</label>
                <input
                  id="footer-website"
                  aria-label="Website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-base btn-yellow w-full sm:w-auto" disabled={subscribe.isPending}>
                {subscribe.isPending ? "Sending…" : "Get Crew Deals"}
                {!subscribe.isPending ? <ArrowRight className="size-4" aria-hidden /> : null}
              </button>
              {fieldError ? (
                <p id="footer-email-error" role="alert" className="text-sm text-tf-yellow">
                  {fieldError}
                </p>
              ) : null}
              {serverError ? (
                <p role="alert" className="rounded-md border border-tf-yellow/40 bg-tf-yellow/10 px-3 py-2 text-sm text-white">
                  {serverError}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="tf-shell flex flex-col gap-2 py-6 text-xs text-white/65 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} TradieForms</p>
          <p>Prices in AUD, including GST.</p>
        </div>
      </div>
    </footer>
  );
}
