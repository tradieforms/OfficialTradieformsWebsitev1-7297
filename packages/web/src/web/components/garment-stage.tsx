import type { GarmentColour, PlacementId, Product } from "../../shared/catalogue";
import { BACK_DIAGRAM_BOX, type PlacementSpot } from "../../shared/placements";
import { cn } from "../lib/utils";
import { type GarmentView, type ResolvedView, logoBoxStyle, resolveView } from "../lib/garment";
import type { LogoTransform } from "../lib/cart";

interface GarmentStageProps {
  colour: GarmentColour;
  view?: GarmentView;
  resolved?: ResolvedView | null;
  logoUrl?: string | null;
  transform?: LogoTransform | null;
  /**
   * Garment outline used for the back when this colour has no back photo yet.
   * Omit it to render nothing for a missing photo (legacy behaviour).
   */
  silhouette?: Product["silhouette"];
  /** Outlines the approved logo spots for this view (studio / bundle placement). */
  spots?: PlacementSpot[];
  selectedSpot?: PlacementId | null;
  /** Lets customers pick a spot by tapping its outline. Never moves the logo freely. */
  onSpotSelect?: (id: PlacementId) => void;
  className?: string;
  /** Dims the garment so overlaid copy stays readable. */
  dimmed?: boolean;
  alt?: string;
}

/** Simple back outlines in the stage's 0–100 space. Box positions match BACK_DIAGRAM_BOX. */
const DIAGRAM_PATH: Record<"sleeved" | "sleeveless", string> = {
  sleeved:
    "M40 14 Q50 18 60 14 L74 18 L90 37 L82 44 L72 34 L72 88 Q50 90 28 88 L28 34 L18 44 L10 37 L26 18 Z",
  sleeveless: "M41 13 Q50 16 59 13 L68 15 Q66 28 72 36 L72 88 Q50 90 28 88 L28 36 Q34 28 32 15 Z",
};

function BackDiagram({
  colour,
  silhouette,
}: {
  colour: GarmentColour;
  silhouette: "sleeved" | "sleeveless";
}) {
  const box = BACK_DIAGRAM_BOX[silhouette];
  return (
    <div className="absolute inset-0" data-back-diagram>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <path
          d={DIAGRAM_PATH[silhouette]}
          fill={colour.hex}
          fillOpacity={0.14}
          stroke="#0B2A5B"
          strokeOpacity={0.55}
          strokeWidth={0.6}
          strokeDasharray="1.6 1.2"
          strokeLinejoin="round"
        />
        <line x1="50" y1="17" x2="50" y2={box.y - box.h / 2 - 2} stroke="#0B2A5B" strokeOpacity={0.2} strokeWidth={0.4} />
      </svg>
      <span className="absolute bottom-[5%] left-1/2 -translate-x-1/2 border border-tf-navy/30 bg-white px-2.5 py-1 font-display text-[0.62rem] font-bold tracking-[0.14em] whitespace-nowrap text-tf-navy uppercase">
        Back photo coming · outline only
      </span>
    </div>
  );
}

/**
 * Renders a transparent garment cutout with an optional logo overlay. The logo is an
 * <img> straight from the uploaded file — no background or blend mode — so genuine
 * alpha transparency is preserved. Logos only ever sit in a fixed spot's box (fitted,
 * never rotated); there is no drag or free positioning.
 */
export function GarmentStage({
  colour,
  view = "front",
  resolved,
  logoUrl,
  transform,
  silhouette,
  spots,
  selectedSpot,
  onSpotSelect,
  className,
  dimmed = false,
  alt,
}: GarmentStageProps) {
  const active = resolved === undefined ? resolveView(colour, view) : resolved;
  const diagram = !active && view === "back" && silhouette && silhouette !== "cap" ? silhouette : null;
  if (!active && !diagram) return null;

  const showLogo = Boolean(logoUrl) && Boolean(transform) && transform?.enabled !== false;

  return (
    <div
      className={cn("relative aspect-square w-full select-none", className)}
      data-view={view}
      data-photo={active ? "true" : "false"}
    >
      {active ? (
        <img
          src={active.image}
          alt={alt ?? `${colour.name} garment ${view} view`}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300",
            dimmed && "opacity-40",
          )}
          draggable={false}
        />
      ) : diagram ? (
        <>
          <span className="sr-only">
            {alt ?? `${colour.name} garment back`} — outline diagram, back photo coming
          </span>
          <BackDiagram colour={colour} silhouette={diagram} />
        </>
      ) : null}

      {spots?.map((s) => {
        const selected = s.id === selectedSpot;
        const style = {
          left: `${s.box.x - s.box.w / 2}%`,
          top: `${s.box.y - s.box.h / 2}%`,
          width: `${s.box.w}%`,
          height: `${s.box.h}%`,
        };
        const cls = cn(
          "absolute z-[5] border border-dashed transition-colors",
          selected ? "border-tf-cta bg-tf-cta/10" : "border-tf-navy/45 bg-white/10",
        );
        return onSpotSelect ? (
          <button
            key={s.id}
            type="button"
            data-spot-outline={s.id}
            aria-label={`Place logo: ${s.label}`}
            aria-pressed={selected}
            tabIndex={-1}
            className={cn(cls, "cursor-pointer p-0 hover:border-tf-cta")}
            style={style}
            onClick={() => onSpotSelect(s.id)}
          />
        ) : (
          <span key={s.id} aria-hidden data-spot-outline={s.id} className={cls} style={style} />
        );
      })}

      {showLogo ? (
        <img
          data-handle="logo"
          src={logoUrl!}
          alt="Your logo placement"
          className="pointer-events-none absolute z-10 block bg-transparent"
          style={logoBoxStyle(transform!)}
          draggable={false}
        />
      ) : null}
    </div>
  );
}
