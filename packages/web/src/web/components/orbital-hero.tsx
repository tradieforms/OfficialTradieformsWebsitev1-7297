import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { cn } from "../lib/utils";
import { getProduct } from "../../shared/catalogue";
import { defaultTransform, logoBoxStyle } from "../lib/garment";

const HERO_SLUGS: Record<string, string> = {
  jacket: "jacket",
  polo: "work-polo",
  hoodie: "hoodie",
  tshirt: "work-t-shirt",
};

/** Same wearer's-left-chest default the Design Studio uses, from the garment's print map. */
function heroLogoAt(cardId: string) {
  return defaultTransform("front", getProduct(HERO_SLUGS[cardId] ?? cardId));
}

gsap.registerPlugin(ScrollTrigger);

/** Height of the sticky site header at the current breakpoint. */
function headerOffset() {
  if (typeof window === "undefined") return 76;
  return window.innerWidth >= 768 ? 76 : 68;
}

interface OrbitCard {
  id: string;
  label: string;
  meta: string;
  image: string;
  /** Shows the logo placeholder on the wearer's left chest (four cards in total). */
  branded?: boolean;
  crew?: string;
}

const DESKTOP_CARDS: OrbitCard[] = [
  {
    id: "jacket",
    label: "Crewneck Jacket",
    meta: "No hood · Navy",
    image: "/images/cutouts/jacket-navy-front.png",
    branded: true,
  },
  {
    id: "hoodie",
    label: "Hoodie",
    meta: "Heavyweight · Navy",
    image: "/images/cutouts/hoodie-navy-front.png",
    branded: true,
  },
  {
    id: "polo",
    label: "Polo",
    meta: "Pique · White",
    image: "/images/cutouts/polo-white-front.png",
    branded: true,
  },
  {
    id: "vest",
    label: "Vest",
    meta: "Puffer · Black",
    image: "/images/cutouts/vest-black-front.png",
  },
  {
    id: "crew",
    label: "Your crew",
    meta: "Kitted out",
    image: "/images/hero/crew-multicraft.webp",
    crew: "Photo",
  },
  {
    id: "jacketb",
    label: "Jacket, Style 2",
    meta: "Hooded · Black",
    image: "/images/cutouts/jacketb-black-front.png",
  },
  {
    id: "tshirt",
    label: "T-Shirt",
    meta: "Crew neck · Black",
    image: "/images/cutouts/tshirt-black-front.png",
    branded: true,
  },
  {
    id: "tank",
    label: "Tank Top",
    meta: "Singlet · White",
    image: "/images/cutouts/tank-white-front.png",
  },
];

const MOBILE_CARDS: OrbitCard[] = [
  {
    id: "jacket",
    label: "Crewneck Jacket",
    meta: "No hood · Navy",
    image: "/images/cutouts/jacket-navy-front.png",
    branded: true,
  },
  {
    id: "hoodie",
    label: "Hoodie",
    meta: "Navy",
    image: "/images/cutouts/hoodie-navy-front.png",
    branded: true,
  },
  {
    id: "polo",
    label: "Polo",
    meta: "White",
    image: "/images/cutouts/polo-white-front.png",
    branded: true,
  },
  { id: "vest", label: "Vest", meta: "Black", image: "/images/cutouts/vest-black-front.png" },
  {
    id: "tshirt",
    label: "T-Shirt",
    meta: "Black",
    image: "/images/cutouts/tshirt-black-front.png",
    branded: true,
  },
];

interface Stage {
  id: string;
  index: string;
  title: string;
  body: string;
}

const STAGES: Stage[] = [
  {
    id: "garment",
    index: "01",
    title: "Gear that holds up on site.",
    body: "Bonded softshells, heavyweight fleece and pique knits — chosen because they survive a working week, not a photo shoot.",
  },
  {
    id: "yours",
    index: "02",
    title: "Upload your logo. Place it where it counts.",
    body: "Pick an approved spot — chest, sleeve or standard back — and see your logo on the real garment at its set print size before you order.",
  },
  {
    id: "brand",
    index: "03",
    title: "Your mark on every back on site.",
    body: "Embroidery and print in your colours, so the crew looks like one company from the gate to the roof.",
  },
  {
    id: "kit",
    index: "04",
    title: "Kit the whole crew in one order.",
    body: "Ready-made seasonal bundles at a locked-in price, or build your own mix from the full range.",
  },
];

/**
 * Uniform scale/opacity curve driven by a card's depth. The floor is low enough
 * that a card at the back recedes into the backdrop instead of reading as a grey
 * wash across the stage.
 */
function depthOpacity(z: number, radius: number) {
  const t = (z + radius) / (radius * 2); // 0 = furthest back, 1 = nearest
  return 0.18 + Math.min(1, Math.max(0, t)) * 0.82;
}

/* ---------- Stacked layout (phones + tablets, below the lg breakpoint) ----------
 * Below 1024px there isn't room to put the orbit beside the headline, so the hero
 * stacks: headline + CTAs at the top, the orbit in whatever height is left, and
 * the narrative stages underneath the orbit. Card size and position are measured
 * from the real layout so the cards never cross the copy on any screen height. */
const STACK_QUERY = "(max-width: 1023.98px)";
const isStacked = () => typeof window !== "undefined" && window.matchMedia(STACK_QUERY).matches;
/** Perspective on .tf-orbit-scene (styles.css). */
const PERSPECTIVE = 1500;
/** Orbit depth used when stacked — shallower, so the front card doesn't balloon. */
const STACK_Z = 220;
/** Approximate figcaption height and vertical wobble of a card, in px. */
const CARD_CAPTION = 34;
const CARD_WOBBLE = 10;
const OPEN_PAD_TOP = 24;

interface StackPlan {
  cardW: number;
  /** Whether the cards fit under the opening copy; otherwise they rise in as it leaves. */
  showOpen: boolean;
  /** Card scale while the opening copy is on screen (fits the space under the CTAs). */
  openScale: number;
  openCenter: number;
  narrCenter: number;
  ringCenter: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Depth of field: the further back a card sits, the softer it reads. */
function depthBlur(z: number, radius: number) {
  const t = (z + radius) / (radius * 2);
  return (1 - Math.min(1, Math.max(0, t))) ** 2 * 2.6;
}

export function OrbitalHero() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const openRef = useRef<HTMLDivElement>(null);
  const openShellRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [cards, setCards] = useState<OrbitCard[]>(DESKTOP_CARDS);

  // Responsive card count — fewer cards on narrow screens, same orbit idea.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setCards(mq.matches ? MOBILE_CARDS : DESKTOP_CARDS);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const angles = useMemo(
    () => cards.map((_, i) => (i / cards.length) * Math.PI * 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cards only drive length
    [cards],
  );

  /* ---------- Reduced motion: a composed, static hero ---------- */
  useEffect(() => {
    if (!reduced) return;
    const ring = ringRef.current;
    const section = sectionRef.current;
    const open = openRef.current;
    const shell = openShellRef.current;
    if (!ring || !section || !open || !shell) return;

    const layout = () => {
      const w = ring.clientWidth || 1000;
      let dy = 0;
      if (isStacked()) {
        // Static stack: copy on top, a band of cards underneath, section grows to fit.
        const cardW = Math.round(Math.min(200, w * 0.42));
        ring.style.setProperty("--orbit-card-w", `${cardW}px`);
        open.style.alignItems = "flex-start";
        open.style.paddingTop = `${OPEN_PAD_TOP}px`;
        const bandTop = OPEN_PAD_TOP + shell.offsetHeight + 16;
        const bandH = cardW + CARD_CAPTION + 80 + 32;
        section.style.minHeight = "";
        if (section.clientHeight < bandTop + bandH) section.style.minHeight = `${bandTop + bandH}px`;
        const secTop = section.getBoundingClientRect().top;
        const rr = ring.getBoundingClientRect();
        dy = bandTop + bandH / 2 - (rr.top - secTop + rr.height / 2);
      } else {
        ring.style.removeProperty("--orbit-card-w");
        open.style.alignItems = "";
        open.style.paddingTop = "";
        section.style.minHeight = "";
      }
      cards.forEach((_, i) => {
        const node = cardRefs.current[i];
        if (!node) return;
        const phi = angles[i];
        node.style.transform = `translate3d(calc(-50% + ${Math.sin(phi) * w * 0.3}px), calc(-50% + ${
          Math.cos(phi) * 40 + dy
        }px), 0) rotateY(${-Math.sin(phi) * 34}deg)`;
        node.style.opacity = String(depthOpacity(Math.cos(phi) * 500, 500));
        node.style.filter = `blur(${depthBlur(Math.cos(phi) * 500, 500).toFixed(2)}px)`;
        node.style.zIndex = String(Math.round(500 + Math.cos(phi) * 500));
      });
    };
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, [reduced, cards, angles]);

  /* ---------- Scroll-driven orbit + stage choreography ---------- */
  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const ring = ringRef.current;
    const open = openRef.current;
    const shell = openShellRef.current;
    const stageBox = stageBoxRef.current;
    if (!section || !ring) return;

    let radiusX = 0;
    let radiusZ = 0;
    let wobble = 18;
    let stack: StackPlan | null = null;

    const clearStack = () => {
      stack = null;
      ring.style.removeProperty("--orbit-card-w");
      section.style.perspectiveOrigin = "";
      if (open) {
        open.style.alignItems = "";
        open.style.paddingTop = "";
      }
    };

    const planStack = (): StackPlan | null => {
      if (!open || !shell || !stageBox) return null;
      const depthScale = PERSPECTIVE / (PERSPECTIVE - STACK_Z);
      const secH = section.clientHeight;
      const secTop = section.getBoundingClientRect().top;
      const shellH = shell.offsetHeight;
      const box = stageBox.getBoundingClientRect();
      const stageH = Math.max(
        0,
        ...stageRefs.current.map((n) => (n ? n.offsetHeight : 0)),
      );
      const stageTop = box.bottom - secTop - stageH;
      const rr = ring.getBoundingClientRect();
      const ringCenter = rr.top - secTop + rr.height / 2;

      // Narrative phase: cards between the top of the hero and the stage copy.
      const narrTop = 14;
      const narrBot = stageTop - 18;
      const fit = (avail: number) => avail / depthScale - CARD_WOBBLE * 2 - CARD_CAPTION;
      const maxW = Math.min(ring.clientWidth >= 640 ? 300 : 230, (ring.clientWidth * 0.56) / depthScale);
      const cardW = Math.round(Math.max(96, Math.min(maxW, fit(narrBot - narrTop))));

      // Opening phase: cards in the space left under the CTAs (top-aligned copy).
      const openTop = OPEN_PAD_TOP + shellH + 18;
      const openBot = secH - 18;
      const openAvail = openBot - openTop;
      const openScale = Math.min(
        1,
        (openAvail / depthScale - CARD_WOBBLE * 2) / (cardW + CARD_CAPTION),
      );
      const showOpen = openScale * cardW >= 96;

      ring.style.setProperty("--orbit-card-w", `${cardW}px`);
      open.style.alignItems = showOpen ? "flex-start" : "center";
      open.style.paddingTop = showOpen ? `${OPEN_PAD_TOP}px` : "0px";
      return {
        cardW,
        showOpen,
        openScale,
        openCenter: (openTop + openBot) / 2,
        narrCenter: (narrTop + narrBot) / 2,
        ringCenter,
      };
    };

    const measure = () => {
      const w = ring.clientWidth || 1000;
      if (isStacked()) {
        radiusX = Math.min(w * 0.34, 300);
        radiusZ = STACK_Z;
        wobble = CARD_WOBBLE;
        stack = planStack();
        return;
      }
      clearStack();
      const narrow = w < 768;
      radiusX = narrow ? w * 0.34 : w * 0.3;
      radiusZ = narrow ? 300 : 560;
      wobble = 18;
    };

    const render = (progress: number) => {
      const spin = progress * Math.PI * 1.9; // a little under two full laps across the sequence
      // Stacked: glide the orbit from under the CTAs (or from below, faded) up into
      // the space above the narrative copy while the headline lifts away.
      let dy = 0;
      let k = 1;
      let fade = 1;
      if (stack) {
        const e = smooth(clamp01((progress - 0.04) / 0.15));
        if (stack.showOpen) {
          dy = lerp(stack.openCenter, stack.narrCenter, e) - stack.ringCenter;
          k = lerp(stack.openScale, 1, e);
        } else {
          dy = stack.narrCenter + (1 - e) * 80 - stack.ringCenter;
          fade = e;
        }
        section.style.perspectiveOrigin = `50% ${(stack.ringCenter + dy).toFixed(1)}px`;
      }
      cards.forEach((_, i) => {
        const node = cardRefs.current[i];
        if (!node) return;
        const phi = angles[i] + spin;
        const x = Math.sin(phi) * radiusX * (stack ? lerp(0.82, 1, k) : 1);
        const z = Math.cos(phi) * radiusZ;
        const y = Math.sin(phi * 2) * wobble + dy;
        // Yaw is derived from horizontal position, not raw angle: the card
        // always faces the camera and simply turns with its depth, so a card
        // never flips past 90deg and blanks out on backface-visibility.
        const yaw = -Math.sin(phi) * 34;
        node.style.transform = `translate3d(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(
          1,
        )}px), ${z.toFixed(1)}px)${k !== 1 ? ` scale(${k.toFixed(3)})` : ""} rotateY(${yaw.toFixed(2)}deg)`;
        node.style.opacity = (depthOpacity(z, radiusZ) * fade).toFixed(3);
        node.style.filter = `blur(${depthBlur(z, radiusZ).toFixed(2)}px)`;
        node.style.zIndex = String(Math.round(600 + z));
      });
    };

    measure();
    render(0);

    const ctx = gsap.context(() => {
      // One pinned ScrollTrigger drives everything: the orbit render and the
      // scrubbed type choreography share a single timeline, so a refresh or a
      // backwards scroll always lands on the same composition.
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          // Pin flush against the bottom of the sticky site header so the top of
          // the composition is never tucked underneath it.
          start: () => `top ${headerOffset()}px`,
          end: () => `+=${Math.round(window.innerHeight * (window.innerWidth < 768 ? 2.3 : 3.1))}`,
          pin: true,
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: (self: ScrollTrigger) => {
            measure();
            render(self.progress);
          },
          onUpdate: (self: ScrollTrigger) => render(self.progress),
        },
      });

      // Opening composition: headline lifts away and hands over to stage 01.
      const open = openRef.current;
      if (open) {
        tl.to(open, { yPercent: -16, autoAlpha: 0, duration: 0.13 }, 0.05).to(
          open,
          { filter: "blur(7px)", duration: 0.13 },
          0.05,
        );
      }

      // Stage 01 → 04: horizontal editorial movement and clip reveals, timed so
      // only one message is on screen at a time.
      const stages = stageRefs.current.filter(Boolean) as HTMLDivElement[];
      stages.forEach((node, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        const start = 0.17 + i * 0.2;
        tl.fromTo(
          node,
          { autoAlpha: 0, xPercent: 13 * dir, clipPath: "inset(0% 0% 100% 0%)" },
          { autoAlpha: 1, xPercent: 0, clipPath: "inset(0% 0% 0% 0%)", duration: 0.07 },
          start,
        ).to(
          node,
          { autoAlpha: 0, xPercent: -9 * dir, clipPath: "inset(0% 0% 92% 0%)", duration: 0.07 },
          start + 0.13,
        );
      });

      // Pad the timeline so timeline time 1.0 is scroll progress 1.0 exactly.
      tl.to({}, { duration: 0.01 }, 0.99);
    }, section);

    const onResize = () => {
      measure();
      ScrollTrigger.refresh();
    };
    window.addEventListener("resize", onResize);
    const refresh = window.setTimeout(() => ScrollTrigger.refresh(), 320);

    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(refresh);
      ctx.revert();
      clearStack();
    };
  }, [reduced, cards, angles]);

  return (
    <section
      ref={sectionRef}
      aria-label="TradieForms workwear range"
      className={cn(
        "tf-orbit-scene relative isolate overflow-hidden bg-tf-navy-deep text-white",
        // Sized to the viewport minus the sticky site header so the opening
        // composition and the narrative stages both sit above the fold.
        reduced
          ? "min-h-[calc(100svh-68px)] md:min-h-[calc(100svh-76px)]"
          : "h-[calc(100svh-68px)] md:h-[calc(100svh-76px)]",
      )}
    >
      {/* Stage backdrop: depth, vignette and the one permitted texture. */}
      <div aria-hidden className="absolute inset-0 tf-stage-dark" />
      <div aria-hidden className="tf-grit absolute inset-0 opacity-70" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 78% at 50% 52%, rgba(6,21,46,0) 34%, rgba(6,21,46,0.72) 78%, rgba(4,12,24,0.94) 100%)",
        }}
      />
      {/* Orbit floor line */}
      <div
        aria-hidden
        className="absolute bottom-[19%] left-1/2 hidden h-[1px] w-[78%] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/18 to-transparent lg:block"
      />

      <div className="relative z-10 flex h-full flex-col">
        {/* Spacer that used to hold a near-invisible "Australian owned" tag; keeps the
            orbit's vertical framing identical. */}
        <div aria-hidden className="pt-6 text-[0.68rem] leading-normal">&nbsp;</div>

        {/* ---- The orbit ---- */}
        <div className="relative flex-1">
          <div
            ref={ringRef}
            className="tf-orbit-ring"
            aria-hidden={false}
          >
            {cards.map((card, i) => (
              <div
                key={card.id}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                className="tf-orbit-card w-[var(--orbit-card-w,clamp(168px,20vw,318px))]"
              >
                <figure className="tf-card @container overflow-hidden border-white/10 bg-white shadow-[0_40px_70px_-40px_rgba(0,0,0,0.85)]">
                  <div className="tf-stage relative aspect-square">
                    <img
                      src={card.image}
                      alt={`${card.label} — ${card.meta}`}
                      loading={i < 3 ? "eager" : "lazy"}
                      // Garment cutouts are contained (never cropped, centred); the crew photo fills.
                      className={`absolute inset-0 h-full w-full ${card.crew ? "object-cover" : "object-contain"}`}
                    />
                    {card.branded ? (
                      // Wearer's left chest = viewer's right on a front photo.
                      <img
                        src="/images/brand/logo-placeholder.svg"
                        alt=""
                        aria-hidden
                        className="pointer-events-none absolute"
                        style={logoBoxStyle(heroLogoAt(card.id))}
                      />
                    ) : null}
                  </div>
                  <figcaption className="flex items-center justify-between gap-2 border-t border-tf-line bg-white px-2 py-2 @min-[10rem]:px-3">
                    <span className="font-display text-[0.72rem] font-bold tracking-[0.04em] text-tf-ink uppercase">
                      {card.label}
                    </span>
                    <span className="hidden truncate text-[0.66rem] font-semibold tracking-[0.08em] text-tf-steel uppercase @min-[9rem]:inline">
                      {card.meta}
                    </span>
                  </figcaption>
                </figure>
              </div>
            ))}
          </div>
        </div>

        {/* Narrative scrim: purely decorative. It lives inside this wrapper, above the
            orbiting cards (z-15) but below the opening composition (z-20). It used to sit at
            section level with z-20, which put it above this whole z-10 wrapper — so it
            dimmed the hero CTAs ("Try the Design Studio") as if they were behind a layer. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] hidden h-[42%] lg:block"
          style={{
            background:
              "linear-gradient(to top, rgba(6,21,46,0.94) 0%, rgba(6,21,46,0.74) 34%, rgba(6,21,46,0.26) 68%, rgba(6,21,46,0) 100%)",
          }}
        />

        {/* ---- Opening composition (complete before any scrolling) ---- */}
        <div
          ref={openRef}
          className="pointer-events-none absolute inset-x-0 top-0 bottom-0 z-20 flex items-center"
        >
          {/* Scrim so the statement never fights the cards travelling behind it (desktop,
              where the orbit sits beside the copy; stacked layouts keep them apart). */}
          <div
            aria-hidden
            className="absolute inset-0 hidden lg:block"
            style={{
              background:
                "linear-gradient(97deg, rgba(6,21,46,0.97) 0%, rgba(6,21,46,0.95) 26%, rgba(6,21,46,0.72) 38%, rgba(6,21,46,0.24) 50%, rgba(6,21,46,0) 60%)",
            }}
          />
          <div ref={openShellRef} className="tf-shell relative w-full">
            <div className="max-w-[42rem]">
              <h1 className="tf-display text-[clamp(2rem,9.4vw,3.4rem)] text-white md:text-[clamp(3.4rem,7.6vw,4.6rem)] lg:text-[clamp(2.7rem,7.6vw,6.2rem)]">
                Your crew. Your colours.
                <br />
                <span className="text-tf-yellow">Your mark.</span>
              </h1>
              <p className="mt-4 max-w-xl lg:max-w-[min(36rem,calc(50vw-4rem))] text-[0.96rem] leading-relaxed text-white/72 md:text-[1.12rem] lg:mt-6 lg:text-[1.1rem]">
                Build a coordinated kit in your colours, upload your logo, and see it on the real
                garment before you order. Embroidered and printed workwear, made for crews who get
                it done.
              </p>
              <div className="pointer-events-auto mt-6 flex flex-wrap gap-3 lg:mt-8">
                <Link to="/design-studio" className="btn-base btn-primary">
                  Try the Design Studio <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link
                  to="/shop"
                  className="btn-base btn-secondary text-white hover:text-white"
                >
                  <span className="transition-colors">Explore workwear</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Narrative stages ---- */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[11%] z-30 md:bottom-[13%]">
          <div ref={stageBoxRef} className="tf-shell relative h-[clamp(10rem,20vh,14rem)]">
            {STAGES.map((stage, i) => (
              <div
                key={stage.id}
                ref={(el) => {
                  stageRefs.current[i] = el;
                }}
                className="absolute inset-x-0 bottom-0 opacity-0"
              >
                <div className="max-w-[34rem] border-l-2 border-tf-yellow pl-5 md:pl-7">
                  <h2 className="tf-display text-[clamp(1.5rem,3.6vw,2.6rem)] text-white">
                    {stage.title}
                  </h2>
                  <p className="mt-3 max-w-lg text-[0.95rem] leading-relaxed text-white/70 md:text-[1rem]">
                    {stage.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div aria-hidden className="h-10 md:h-12" />
      </div>
    </section>
  );
}
