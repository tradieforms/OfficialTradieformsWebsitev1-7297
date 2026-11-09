import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, ShoppingCart, User, X } from "lucide-react";
import { authClient } from "../lib/auth";
import { useCart } from "../lib/cart";
import { cn } from "../lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/design-studio", label: "Try the Design Studio" },
  { href: "/bundle-deals", label: "Bundle Deals" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const cart = useCart();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-tf-line-dark/70 bg-tf-navy text-white transition-shadow duration-300",
        scrolled && "shadow-[0_14px_34px_-26px_rgba(6,21,46,0.9)]",
      )}
    >
      <div className="tf-shell flex h-[68px] items-center gap-4 md:h-[76px]">
        <Link
          to="/"
          className="flex shrink-0 items-center py-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-tf-yellow"
          aria-label="TradieForms home"
        >
          {/* Trimmed asset (no transparent padding) so the mark sits on the
              header's optical centre line and keeps its 1524:457 ratio. */}
          <img
            src="/images/brand/tradieforms-logo-trim.png"
            alt="TradieForms"
            width={1524}
            height={457}
            className="h-[26px] w-auto max-w-[44vw] object-contain sm:h-7 md:h-8"
          />
        </Link>

        <nav className="ml-2 hidden items-center gap-0.5 lg:flex xl:ml-4 xl:gap-1" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "relative px-2.5 py-2 font-display text-[0.86rem] font-semibold tracking-[0.02em] whitespace-nowrap text-white/80 transition-colors hover:text-white xl:px-3",
                  active && "text-white",
                )}
              >
                {item.label}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-2.5 -bottom-0.5 h-[2px] xl:inset-x-3 bg-tf-yellow transition-transform duration-200",
                    active ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <Link
            to={session?.user ? "/account" : "/login"}
            className="hidden items-center gap-2 px-3 py-2 font-display text-[0.84rem] font-semibold text-white/85 transition-colors hover:text-white sm:flex"
          >
            <User className="size-4" aria-hidden />
            {/* Icon-only between lg and xl so the full primary nav fits on one line. */}
            <span className="whitespace-nowrap lg:sr-only xl:not-sr-only">
              {session?.user ? (session.user.name?.split(" ")[0] ?? "Account") : "Sign in"}
            </span>
          </Link>

          <Link
            to="/cart"
            className="relative flex items-center gap-2 px-3 py-2 font-display text-[0.84rem] font-semibold text-white/85 transition-colors hover:text-white"
            aria-label={`Cart, ${cart.count} ${cart.count === 1 ? "item" : "items"}`}
          >
            <ShoppingCart className="size-4" aria-hidden />
            {cart.count > 0 ? (
              <span className="absolute -top-0.5 left-6 grid min-w-[18px] place-items-center rounded-full bg-tf-yellow px-1 font-display text-[0.65rem] font-bold text-tf-navy-deep">
                {cart.count}
              </span>
            ) : null}
          </Link>

          <Link to="/bundle-deals" className="btn-base btn-primary hidden !px-4 !py-2.5 !text-[0.8rem] whitespace-nowrap md:inline-flex">
            Build Bundle
          </Link>

          <button
            type="button"
            className="ml-1 grid size-9 place-items-center text-white lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-tf-line-dark/70 bg-tf-navy-deep lg:hidden">
          <nav className="tf-shell flex flex-col py-2" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="border-b border-white/5 py-3 font-display text-base font-bold text-white/90 last:border-0"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to={session?.user ? "/account" : "/login"}
              className="border-b border-white/5 py-3 font-display text-base font-bold text-tf-yellow"
            >
              {session?.user ? "My account" : "Sign in"}
            </Link>
            <Link to="/bundle-deals" className="btn-base btn-primary my-3 justify-center">
              Build Bundle
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
