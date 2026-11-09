import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useCatalogue } from "../../queries/catalogue";
import { BundleCard } from "../bundle-card";
import { Reveal } from "../reveal";

const STEPS = [
  {
    index: "01",
    title: "Pick your kit",
    body: "Choose the garments, colours, sizes and quantities your crew actually needs.",
  },
  {
    index: "02",
    title: "Add your logo",
    body: "Upload your logo and set its placement on each garment.",
  },
  {
    index: "03",
    title: "Order your kit",
    body: "Design your kit and place your order. Then we'll produce and ship your gear.",
  },
];

export function BundleDealsSection() {
  const catalogue = useCatalogue();

  return (
    <section className="bg-white py-[clamp(4.5rem,9vw,8rem)]">
      <div className="tf-shell">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <Reveal>
            <h2 className="tf-display text-[clamp(2rem,4.6vw,3.4rem)] text-tf-ink">
              Featured bundles
            </h2>
            <p className="mt-4 max-w-xl text-[1rem] leading-relaxed text-tf-steel">
              Locked-in seasonal pricing across the full range. Pick your own garments and
              quantities — once your kit reaches a tier&apos;s piece count, that rate applies.
            </p>
          </Reveal>
          <Reveal delay={80} className="md:pb-2">
            <Link to="/bundle-deals" className="btn-base btn-secondary text-tf-navy">
              <span>See bundle deals</span> <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Reveal>
        </div>

        {catalogue.isLoading ? (
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse border border-tf-line">
                <div className="aspect-[16/11] bg-tf-paper-dim" />
                <div className="space-y-3 p-5">
                  <div className="h-4 w-1/2 bg-tf-paper-dim" />
                  <div className="h-3 w-4/5 bg-tf-paper-dim" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {(catalogue.data?.bundles ?? []).map((bundle, i) => (
              <Reveal key={bundle.id} delay={i * 60} as="div" className="h-full">
                <BundleCard bundle={bundle} />
              </Reveal>
            ))}
          </div>
        )}

        <div className="mt-16 grid gap-px border border-tf-line bg-tf-line md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.index} delay={i * 70} className="bg-tf-paper p-7 md:p-9">
              <p className="font-display text-[2.4rem] leading-none font-black text-tf-navy/15">
                {step.index}
              </p>
              <h3 className="tf-display mt-4 text-[1.25rem] text-tf-ink">{step.title}</h3>
              <p className="mt-3 text-[0.92rem] leading-relaxed text-tf-steel">{step.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
