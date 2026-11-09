import { Link } from "wouter";
import { ArrowRight, Quote } from "lucide-react";
import { PageIntro } from "../components/layout";
import { Reveal } from "../components/reveal";
import { ParallaxImage } from "../components/parallax-image";

const PILLARS = [
  {
    index: "01",
    title: "Australian owned",
    body: "Built here for Aussie crews.",
    detail:
      "Owned and run in Australia. Our supplier and decoration partners are local, and every order is handled by people who know what a working week looks like.",
  },
  {
    index: "02",
    title: "We get you",
    body: "We know what it's like on site, our gear is built for it.",
    detail:
      "Heavyweight fleece, bonded softshells and pique knits chosen because they survive the job — not because they photograph well.",
  },
  {
    index: "03",
    title: "Fair turnaround time",
    body: "We aren't the fastest, our priority is getting it right.",
    detail:
      "We won't promise a same-day turnaround we can't hold. We'd rather tell you the real lead time and land the order looking right the first time.",
  },
];

const CLIENTS = [
  { name: "Multicraft Group", image: "/images/hero/crew-multicraft.webp", alt: "Tradie in a branded polo on a Melbourne building site" },
  { name: "Slate Craft & Co", image: "/images/hero/crew-slatecraft.webp", alt: "Two tradies in matching branded polos on a roofing job" },
  { name: "Sutherlands Transport", image: "/images/hero/crew-sutherland.jpg", alt: "Sutherlands Transport staff member in a branded polo" },
  { name: "FCC Doors", image: "/images/hero/crew-fcc.png", alt: "FCC Doors crew in branded hoodies and polos" },
];

export default function AboutPage() {
  return (
    <>
      <PageIntro
        title={
          <>
            Two mates.
            <br />
            One problem.
          </>
        }
        intro="Most branded workwear looks average and takes forever. We started TradieForms to fix both."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/bundle-deals" className="btn-base btn-primary">
            Build your bundle <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link to="/contact" className="btn-base btn-secondary text-white hover:text-white">
            <span>Talk to us</span>
          </Link>
        </div>
      </PageIntro>

      {/* ---------- The story ---------- */}
      <section className="bg-white py-[clamp(4rem,8vw,7rem)]">
        <div className="tf-shell grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div className="lg:order-2">
            <Reveal>
              <figure className="relative">
                <ParallaxImage
                  src="/images/about/story-crew.jpg"
                  alt="A crew of tradies in hi-vis and hard hats giving a thumbs up on site"
                  className="aspect-[4/3] w-full sm:aspect-[3/2]"
                />
                <figcaption className="absolute -bottom-5 -left-5 hidden max-w-[15rem] bg-tf-yellow px-5 py-4 font-display text-[0.82rem] leading-snug font-bold text-tf-navy-deep sm:block">
                  Gear that survives a working week, not a photo shoot.
                </figcaption>
              </figure>
            </Reveal>
          </div>

          <div className="lg:order-1">
            <Reveal>
              <h2 className="tf-display text-[clamp(1.9rem,4.4vw,3.2rem)] text-tf-ink">
                We waited weeks for uniform that still looked wrong.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <div className="mt-7 space-y-5 text-[1.02rem] leading-relaxed text-tf-steel">
                <p>
                  We&apos;re Australian. We&apos;ve been on the job and we&apos;ve waited weeks for
                  uniform that still looked wrong when it landed.
                </p>
                <p>
                  So we built a simpler path: pick a bundle, upload your logo, see it on the gear,
                  order online. Sorted.
                </p>
                <p>
                  If you&apos;re kitting a crew, you want it done once and done right — you&apos;re
                  in the right place.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- The three pillars ---------- */}
      <section className="tf-grit border-y border-tf-line-dark bg-tf-navy py-[clamp(4rem,8vw,7rem)] text-white">
        <div className="tf-shell">
          <Reveal>
            <h2 className="tf-display max-w-2xl text-[clamp(1.9rem,4.4vw,3.2rem)] text-white">
              Three things we won&apos;t budge on.
            </h2>
          </Reveal>

          <ol className="mt-12 grid gap-px bg-white/12 lg:grid-cols-3">
            {PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 80} as="li" className="bg-tf-navy p-7 md:p-9">
                <span className="font-display text-[0.72rem] font-black tracking-[0.18em] text-tf-yellow uppercase">
                  {pillar.index}
                </span>
                <h3 className="tf-display mt-5 text-[1.4rem] text-white">{pillar.title}</h3>
                <p className="mt-3 text-[0.95rem] leading-relaxed font-semibold text-white/85">
                  {pillar.body}
                </p>
                <p className="mt-3 text-[0.9rem] leading-relaxed text-white/60">{pillar.detail}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Clients ---------- */}
      <section className="bg-tf-paper py-[clamp(4rem,8vw,7rem)]">
        <div className="tf-shell">
          <Reveal>
            <h2 className="tf-display max-w-2xl text-[clamp(1.9rem,4.4vw,3.2rem)] text-tf-ink">
              Crews already wearing it
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CLIENTS.map((client, i) => (
              <Reveal key={client.name} delay={i * 60} as="article">
                <div className="group relative overflow-hidden bg-tf-navy-deep">
                  <img
                    src={client.image}
                    alt={client.alt}
                    loading="lazy"
                    className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-tf-navy-deep via-tf-navy-deep/25 to-transparent"
                  />
                  <h3 className="absolute inset-x-0 bottom-0 p-5 font-display text-[0.86rem] font-black tracking-[0.12em] text-tf-yellow uppercase">
                    {client.name}
                  </h3>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={80}>
            <figure className="mt-14 grid gap-8 border-l-2 border-tf-orange bg-white p-8 md:grid-cols-[auto_1fr] md:gap-10 md:p-12">
              <Quote className="size-10 text-tf-yellow" aria-hidden />
              <div>
                <blockquote className="tf-display text-[clamp(1.15rem,2.4vw,1.75rem)] leading-[1.35] text-tf-ink">
                  &ldquo;Recently bought the winter starter pack from TradieForms and I can honestly
                  say the quality is top notch as well as the fit. The guys at TradieForms were
                  exceptional when dealing with them and communication was straight forward. 100%
                  would recommend to anyone who is looking to buy some uniform.&rdquo;
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-4">
                  <span className="h-[1px] w-10 bg-tf-orange" aria-hidden />
                  <span className="font-display text-[0.8rem] font-bold tracking-[0.14em] text-tf-navy uppercase">
                    Mohsen H.
                  </span>
                </figcaption>
              </div>
            </figure>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-tf-line bg-white py-[clamp(3.5rem,7vw,5.5rem)]">
        <div className="tf-shell flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="tf-display text-[clamp(1.6rem,3.6vw,2.6rem)] text-tf-ink">
              Kitting a crew? Start with a pack.
            </h2>
            <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-tf-steel">
              Pick a ready-made bundle at a locked-in price, or build your own mix and add your logo.
            </p>
          </div>
          <Link to="/bundle-deals" className="btn-base btn-primary">
            Build your bundle <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
