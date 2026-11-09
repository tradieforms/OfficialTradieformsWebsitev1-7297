import { Link } from "wouter";
import { ArrowRight, Quote } from "lucide-react";
import { Reveal } from "../reveal";

const CLIENTS = [
  {
    name: "Multicraft Group",
    image: "/images/hero/crew-multicraft.webp",
    alt: "Tradie in a branded polo on a Melbourne building site",
    copy: "Full crew kit in their colours, logo placed front and back.",
  },
  {
    name: "Slate Craft & Co",
    image: "/images/hero/crew-slatecraft.webp",
    alt: "Two tradies in matching branded polos on a roofing job",
    copy: "Site-ready polos and jackets for a growing team.",
  },
  {
    name: "Sutherlands Transport",
    image: "/images/hero/crew-sutherland.jpg",
    alt: "Sutherlands Transport staff member in a branded polo",
    copy: "Branded polos for the yard and the office.",
  },
  {
    name: "FCC Doors",
    image: "/images/hero/crew-fcc.png",
    alt: "FCC Doors crew in branded hoodies and polos",
    copy: "Hoodies and polos with the mark on the chest.",
  },
];

const TESTIMONIAL = {
  quote:
    "Recently bought the winter starter pack from TradieForms and I can honestly say the quality is top notch as well as the fit. The guys at TradieForms were exceptional when dealing with them and communication was straight forward. 100% would recommend to anyone who is looking to buy some uniform.",
  author: "Mohsen H.",
};

export function ClientResults() {
  return (
    <section className="bg-tf-paper-dim py-[clamp(4.5rem,9vw,8rem)]">
      <div className="tf-shell">
        <Reveal>
          <h2 className="tf-display max-w-2xl text-[clamp(2rem,4.6vw,3.4rem)] text-tf-ink">
            See how other tradies elevated their brand
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
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h3 className="font-display text-[0.9rem] font-black tracking-[0.12em] text-tf-yellow uppercase">
                    {client.name}
                  </h3>
                  <p className="mt-1.5 text-[0.82rem] leading-snug text-white/75">{client.copy}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <figure className="mt-14 grid gap-8 border-l-2 border-tf-orange bg-white p-8 md:grid-cols-[auto_1fr] md:gap-10 md:p-12">
            <Quote className="size-10 text-tf-yellow" aria-hidden />
            <div>
              <blockquote className="tf-display text-[clamp(1.15rem,2.4vw,1.75rem)] leading-[1.35] text-tf-ink">
                &ldquo;{TESTIMONIAL.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-4">
                <span className="h-[1px] w-10 bg-tf-orange" aria-hidden />
                <span className="font-display text-[0.8rem] font-bold tracking-[0.14em] text-tf-navy uppercase">
                  {TESTIMONIAL.author}
                </span>
              </figcaption>
            </div>
          </figure>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link to="/shop" className="btn-base btn-primary">
              Start your kit <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link to="/contact" className="btn-base btn-secondary text-tf-navy">
              <span>Talk to us about a bulk quote</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
