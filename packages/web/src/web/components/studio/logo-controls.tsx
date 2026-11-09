import { AlertTriangle, Check, Loader2, Trash2, Upload } from "lucide-react";
import type { LogoTransform } from "../../lib/cart";
import type { GarmentColour, PlacementId, Product } from "../../../shared/catalogue";
import { type PlacementSpot, hasBackPhoto, offersBack, spotsForView } from "../../../shared/placements";
import type { GarmentView } from "../../lib/garment";
import { cn } from "../../lib/utils";
import { type DecorationMethod, EMBROIDERY_FEE, viewMethod } from "../../../shared/decoration";
import { formatAUD } from "../../../shared/catalogue";
import type { LogoAnalysis } from "../../lib/logo-file";

interface UploaderProps {
  logoName?: string | null;
  logoUrl?: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
  error?: string | null;
  analysis?: LogoAnalysis | null;
}

/** Logo file picker with type/size guidance and an honest transparency check. */
export function LogoUploader({
  logoName,
  logoUrl,
  uploading,
  onUpload,
  onClear,
  error,
  analysis,
}: UploaderProps) {
  return (
    <div>
      <label
        htmlFor="logo-upload"
        className="flex cursor-pointer items-center justify-between gap-4 border border-dashed border-tf-navy/40 bg-tf-paper px-4 py-5 transition-colors hover:border-tf-navy focus-within:border-tf-navy"
      >
        <span className="flex min-w-0 items-center gap-3">
          {uploading ? (
            <Loader2 className="size-5 shrink-0 animate-spin text-tf-navy" aria-hidden />
          ) : (
            <Upload className="size-5 shrink-0 text-tf-navy" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="block font-display text-[0.9rem] font-bold tracking-[0.02em] text-tf-ink">
              {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload your logo"}
            </span>
            <span className="mt-0.5 block truncate text-[0.8rem] text-tf-steel">
              {logoName ?? "Transparent PNG or SVG works best · JPG, WEBP also OK · up to 5 MB"}
            </span>
          </span>
        </span>
        <span className="shrink-0 font-display text-[0.72rem] font-bold tracking-[0.12em] text-tf-navy uppercase">
          Browse
        </span>
      </label>
      <input
        id="logo-upload"
        aria-label={logoUrl ? "Replace logo" : "Upload your logo"}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />

      {error ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[0.84rem] font-semibold text-tf-rust">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}

      {logoUrl ? (
        <div className="mt-4 flex items-center gap-4 border border-tf-line p-3">
          <div className="tf-checker grid size-20 shrink-0 place-items-center border border-tf-line p-1.5">
            <img src={logoUrl} alt="Your uploaded logo" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1 text-[0.82rem] leading-snug">
            {analysis?.solidBackground ? (
              <p className="flex items-start gap-2 text-tf-ink">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
                <span>
                  This file has a solid background built in, so it will show (and print) as a
                  rectangle. Use <strong>Remove background</strong> below to make it transparent, or
                  upload a transparent PNG or SVG.
                </span>
              </p>
            ) : analysis?.transparent ? (
              <p className="flex items-start gap-2 text-tf-ink">
                <Check className="mt-0.5 size-4 shrink-0 text-tf-navy" aria-hidden />
                Transparent background detected — it sits straight on the garment.
              </p>
            ) : (
              <p className="text-tf-steel">
                The checkerboard behind the preview shows any transparent areas.
              </p>
            )}
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-tf-navy underline-offset-2 hover:underline"
              onClick={onClear}
            >
              <Trash2 className="size-3.5" aria-hidden /> Remove logo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface SpotPickerProps {
  product: Product;
  colour: GarmentColour;
  front: LogoTransform;
  back: LogoTransform;
  /** null = no logo on that view. */
  onSelect: (view: GarmentView, id: PlacementId | null) => void;
  /** Switches the preview to the view a tile belongs to. */
  onFocusView?: (view: GarmentView) => void;
  /** Prefix for input ids/names when more than one picker is on the page. */
  idPrefix?: string;
  disabled?: boolean;
  /** Print / embroidery per view. Omit to hide the method choice. */
  onMethod?: (view: GarmentView, method: DecorationMethod) => void;
}

/**
 * Print vs embroidery for one view. Embroidery is A$16 per garment, charged once
 * even when both the front and the back are embroidered.
 */
export function MethodToggle({
  view,
  logo,
  onMethod,
  idPrefix = "studio",
  disabled,
}: {
  view: GarmentView;
  logo: LogoTransform;
  onMethod: (view: GarmentView, method: DecorationMethod) => void;
  idPrefix?: string;
  disabled?: boolean;
}) {
  const current = viewMethod(logo) ?? "print";
  const name = `${idPrefix}-${view}-method`;
  const options: { id: DecorationMethod; title: string; meta: string }[] = [
    { id: "print", title: "Print", meta: "Included in the garment price" },
    { id: "embroidery", title: "Embroidery", meta: `+${formatAUD(EMBROIDERY_FEE)} per garment` },
  ];
  return (
    <fieldset className="m-0 mt-3 min-w-0 border-0 p-0" data-method-group={view}>
      <legend className="block p-0 text-[0.74rem] font-semibold text-tf-ink">
        {view === "front" ? "Front" : "Back"} decoration
      </legend>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {options.map((o) => {
          const checked = current === o.id;
          return (
            <label
              key={o.id}
              data-testid={`${idPrefix}-${view}-method-${o.id}`}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 border px-3 py-2 transition-colors",
                checked ? "border-tf-navy bg-tf-navy text-white" : "border-tf-line bg-white text-tf-ink hover:border-tf-navy",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                disabled={disabled}
                onChange={() => onMethod(view, o.id)}
                aria-label={`${view === "front" ? "Front" : "Back"} ${o.title}, ${o.meta}`}
              />
              <span className="font-display text-[0.84rem] font-bold">{o.title}</span>
              <span className={cn("text-[0.72rem] leading-snug", checked ? "text-white/80" : "text-tf-steel")}>{o.meta}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SpotTile({
  name,
  checked,
  disabled,
  onChange,
  title,
  meta,
  hint,
  recommended,
  testId,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  title: string;
  meta?: string;
  hint?: string;
  recommended?: boolean;
  testId: string;
}) {
  return (
    <label
      data-spot={testId}
      data-selected={checked}
      className={cn(
        "relative flex min-h-[4.5rem] cursor-pointer flex-col justify-between gap-1 border px-3 py-2.5 transition-colors",
        checked
          ? "border-tf-navy bg-tf-navy text-white"
          : "border-tf-line bg-white text-tf-ink hover:border-tf-navy/60",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={`${title}${meta ? `, ${meta}` : ""}${recommended ? ", recommended" : ""}`}
      />
      <span className="flex items-start justify-between gap-2">
        <span className="font-display text-[0.86rem] leading-tight font-bold tracking-[0.02em]">{title}</span>
        {recommended ? (
          <span
            className={cn(
              "shrink-0 px-1.5 py-0.5 font-display text-[0.56rem] font-bold tracking-[0.12em] uppercase",
              checked ? "bg-tf-yellow text-tf-navy-deep" : "bg-tf-yellow/30 text-tf-navy",
            )}
          >
            Recommended
          </span>
        ) : null}
      </span>
      {meta || hint ? (
        <span className={cn("text-[0.74rem] leading-snug", checked ? "text-white/80" : "text-tf-steel")}>
          {meta}
          {meta && hint ? " · " : ""}
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function SpotGroup({
  label,
  view,
  spots,
  current,
  onSelect,
  onFocusView,
  idPrefix,
  disabled,
  note,
  onMethod,
}: {
  label: string;
  view: GarmentView;
  spots: PlacementSpot[];
  current: LogoTransform;
  onSelect: SpotPickerProps["onSelect"];
  onFocusView?: SpotPickerProps["onFocusView"];
  idPrefix: string;
  disabled?: boolean;
  note?: string;
  onMethod?: SpotPickerProps["onMethod"];
}) {
  const name = `${idPrefix}-${view}-spot`;
  const selected = current.enabled ? current.placementId : null;
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" data-spot-group={view}>
      <legend className="tf-eyebrow block p-0 text-tf-steel">{label}</legend>
      {note ? <p className="mt-1.5 text-[0.76rem] leading-snug text-tf-steel">{note}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {spots.map((s) => (
          <SpotTile
            key={s.id}
            name={name}
            testId={s.id}
            checked={selected === s.id}
            disabled={disabled}
            onChange={() => {
              onSelect(view, s.id);
              onFocusView?.(view);
            }}
            title={s.label}
            meta={`up to ${s.widthCm} × ${s.heightCm} cm`}
            hint={s.hint}
            recommended={s.recommended}
          />
        ))}
        <SpotTile
          name={name}
          testId={`${view}-none`}
          checked={!selected}
          disabled={disabled}
          onChange={() => {
            onSelect(view, null);
            onFocusView?.(view);
          }}
          title={view === "front" ? "No front logo" : "No back logo"}
        />
      </div>
      {onMethod && selected ? (
        <MethodToggle view={view} logo={current} onMethod={onMethod} idPrefix={idPrefix} disabled={disabled} />
      ) : null}
    </fieldset>
  );
}

/**
 * Fixed-spot picker: one front spot and one back spot per garment, at most.
 * There is no free positioning, resizing or rotation — each spot has a set size.
 */
export function SpotPicker({
  product,
  colour,
  front,
  back,
  onSelect,
  onFocusView,
  idPrefix = "studio",
  disabled,
  onMethod,
}: SpotPickerProps) {
  const frontSpots = spotsForView(product, colour, "front");
  const backSpots = offersBack(product) ? spotsForView(product, colour, "back") : [];
  const hasSleeves = frontSpots.some((s) => s.id.endsWith("sleeve"));
  return (
    <div className="space-y-6" data-spot-picker>
      <SpotGroup
        label="Front — pick one"
        view="front"
        spots={frontSpots}
        current={front}
        onSelect={onSelect}
        onFocusView={onFocusView}
        idPrefix={idPrefix}
        disabled={disabled}
        onMethod={onMethod}
        note={
          hasSleeves
            ? "Sleeves count as the front spot, so a sleeve logo replaces a chest logo."
            : product.silhouette === "sleeveless"
              ? "Sleeveless garment — no sleeve spots."
              : undefined
        }
      />
      {backSpots.length ? (
        <SpotGroup
          label="Back — pick one"
          view="back"
          spots={backSpots}
          current={back}
          onSelect={onSelect}
          onFocusView={onFocusView}
          idPrefix={idPrefix}
          disabled={disabled}
          onMethod={onMethod}
          note={
            hasBackPhoto(colour)
              ? undefined
              : "No back photo for this colour yet — the preview shows a labelled outline. Production prints the same Standard Back."
          }
        />
      ) : (
        <p className="text-[0.78rem] leading-snug text-tf-steel">
          {product.name} takes a front logo only.
        </p>
      )}
      <p className="border-t border-tf-line pt-4 text-[0.76rem] leading-snug text-tf-steel">
        One front spot and one back spot per garment. Left and right mean the <em>wearer&apos;s</em> —
        a left chest logo shows on the right as you face the garment. Each spot has a set size; your
        logo is scaled to fit inside it, keeping its proportions.
        {onMethod
          ? ` Each logo can be printed or embroidered. Embroidery adds ${formatAUD(EMBROIDERY_FEE)} per garment — once per garment, even if both the front and the back are embroidered.`
          : null}
      </p>
    </div>
  );
}
