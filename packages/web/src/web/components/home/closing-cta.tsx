import { Link } from "wouter";
import { ArrowRight, Package, Palette, Upload } from "lucide-react";
import { Reveal } from "../reveal";

const ROUTES = [
  {
    icon: Package,
    title: "Shop the range",
    body: "Eight garments, all built for site work. Pick a piece and brand it.",
    href: "/shop",
    cta: "Shop all gear",
  },
  {
    icon: Palette,
    title: "Customise a garment",
    body: "Pick a garment in the Design Studio and see your logo on the real photo.",
    href: "/design-studio",
    cta: "Design Studio",
  },
  {
    icon: Upload,
    title: "Build your kit",
    body: "Locked-in bundle pricing across the full range, sized per garment.",
    href: "/bundle-deals",
    cta: "Build your kit",
  },
];

export function ClosingCta() {
  return (
    <section className="tf-grit relative overflow-hidden bg-tf-navy text-white">
      <div className="tf-shell py-[clamp(4.5rem,9vw,8rem)]">
        <Reveal>
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
            <div>
              <h2 className="tf-display text-[clamp(2.2rem,5.4vw,4rem)] text-white">
                Get the crew
                <br />
                looking the part.
              </h2>
            </div>
            <p className="text-[1.02rem] leading-relaxed text-white/70 md:pb-3">
              Pick a ready-made bundle or build your own mix, add your logo, and order the lot in one
              go. Bulk quotes for bigger crews are a message away.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-px bg-white/10 md:grid-cols-3">
          {ROUTES.map((route, i) => (
            <Reveal key={route.title} delay={i * 70} className="bg-tf-navy p-7 md:p-9">
              <route.icon className="size-7 text-tf-yellow" aria-hidden />
              <h3 className="tf-display mt-5 text-[1.3rem] text-white">{route.title}</h3>
              <p className="mt-3 text-[0.92rem] leading-relaxed text-white/65">{route.body}</p>
              <Link
                to={route.href}
                className="mt-6 inline-flex items-center gap-2 font-display text-[0.82rem] font-bold tracking-[0.08em] text-tf-yellow uppercase transition-transform duration-200 hover:translate-x-1"
              >
                {route.cta} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
