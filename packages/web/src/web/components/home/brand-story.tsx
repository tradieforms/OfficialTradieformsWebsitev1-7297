import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Reveal } from "../reveal";

const PILLARS = [
  {
    title: "Australian owned",
    body: "Built here for Aussie crews.",
  },
  {
    title: "We get you",
    body: "We know what it's like on site, our gear is built for it.",
  },
  {
    title: "Fair turnaround time",
    body: "We aren't the fastest, our priority is getting it right.",
  },
];

export function BrandStory() {
  return (
    <section className="relative overflow-hidden bg-tf-paper py-[clamp(4.5rem,9vw,8rem)]">
      <div className="tf-shell grid gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        <div className="relative">
          <Reveal>
            <figure className="relative z-10">
              <img
                src="/images/hero/crew-slatecraft.webp"
                alt="Two tradies in matching branded polos on a roofing job"
                loading="lazy"
                className="aspect-[4/5] w-full object-cover"
              />
            </figure>
          </Reveal>
          <Reveal delay={140}>
            <figure className="relative z-20 -mt-[22%] ml-auto w-[58%] border-4 border-tf-paper">
              <img
                src="/images/hero/crew-fcc.png"
                alt="FCC Doors crew in branded hoodies and polos"
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            </figure>
          </Reveal>
          <div
            aria-hidden
            className="absolute -top-6 -left-6 h-40 w-40 border border-tf-navy/12"
          />
        </div>

        <div className="lg:pt-10">
          <Reveal>
            <h2 className="tf-display text-[clamp(2rem,4.6vw,3.4rem)] text-tf-ink">
              Two mates.
              <br />
              One problem.
            </h2>
          </Reveal>

          <Reveal delay={90}>
            <div className="mt-6 space-y-5 text-[1.02rem] leading-relaxed text-tf-steel">
              <p>
                Most branded workwear looks average and takes forever. We started TradieForms to fix
                both.
              </p>
              <p>
                We&apos;re Australian. We&apos;ve been on the job and we&apos;ve waited weeks for
                uniform that still looked wrong when it landed.
              </p>
              <p>
                So we built a simpler path: pick a bundle, upload your logo, see it on the gear,
                order online. Sorted.
              </p>
              <p>
                If you&apos;re kitting a crew, you want it done once and done right — you&apos;re in
                the right place.
              </p>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <ul className="mt-9 divide-y divide-tf-line border-y border-tf-line">
              {PILLARS.map((pillar) => (
                <li key={pillar.title} className="grid grid-cols-[auto_1fr] gap-5 py-5">
                  <span className="mt-2 h-[1px] w-8 bg-tf-orange" aria-hidden />
                  <div>
                    <h3 className="font-display text-[0.95rem] font-bold tracking-[0.02em] text-tf-navy uppercase">
                      {pillar.title}
                    </h3>
                    <p className="mt-1 text-[0.92rem] text-tf-steel">{pillar.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={200}>
            <Link to="/about" className="btn-base btn-secondary mt-9 text-tf-navy">
              <span>Our story</span> <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
