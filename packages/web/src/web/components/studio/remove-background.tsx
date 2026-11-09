import { AlertTriangle, Eraser, Loader2, Undo2, Wand2 } from "lucide-react";
import type { LogoAnalysis } from "../../lib/logo-file";
import { cn } from "../../lib/utils";
import { useRemoveLogoBackground } from "../../queries/upload";

export interface LogoState {
  key: string;
  url: string;
  name: string;
  /** The file in memory (fresh uploads); restored logos only have their URL. */
  file?: File | null;
  analysis?: LogoAnalysis | null;
  /** Set on a background-removed copy: the upload it was made from (for Undo). */
  original?: LogoState | null;
  /** True when enclosed background areas were cleared too. */
  holes?: boolean;
}

interface Props {
  logo: LogoState;
  /** Replace the logo (placements are the parent's and stay as they are). */
  onChange: (next: LogoState) => void;
  /** "dark" for the navy bundle-builder panel. */
  tone?: "light" | "dark";
  className?: string;
  /** Show the prompt even when the file has no detected solid background. */
  always?: boolean;
}

const isSvg = (l: LogoState) => l.file?.type === "image/svg+xml" || /\.svg$/i.test(l.name);

/**
 * "Remove background" for logos with a built-in background box: makes a transparent PNG
 * copy in the browser (edge colour flood-fill), uploads it as a new file and swaps it in.
 * The original upload is kept untouched — Undo puts it straight back.
 */
export function RemoveBackground({ logo, onChange, tone = "light", className, always = false }: Props) {
  const remove = useRemoveLogoBackground();
  const original = logo.original ?? null;

  const dark = tone === "dark";
  const text = dark ? "text-white/85" : "text-tf-steel";
  const strong = dark ? "text-white" : "text-tf-ink";
  const link = cn(
    "inline-flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline disabled:opacity-60",
    dark ? "text-tf-yellow" : "text-tf-navy",
  );

  const run = (from: LogoState, clearHoles: boolean) => {
    remove.mutate(
      { source: from.file ?? from.url, name: from.name, holes: clearHoles },
      {
        onSuccess: (r) =>
          onChange({
            key: r.key,
            url: r.url,
            name: r.name,
            file: r.file,
            analysis: r.analysis,
            original: from,
            holes: clearHoles,
          }),
      },
    );
  };

  const error = remove.isError ? (remove.error as Error).message : null;

  if (original) {
    return (
      <div
        className={cn("text-[0.8rem] leading-snug", text, className)}
        data-testid="bg-removed"
        aria-live="polite"
      >
        <p className="flex items-start gap-2">
          <Wand2 className={cn("mt-0.5 size-4 shrink-0", dark ? "text-tf-yellow" : "text-tf-navy")} aria-hidden />
          <span>
            <strong className={strong}>Background removed.</strong> This is a transparent PNG copy of{" "}
            <span className={strong}>{original.name}</span> — your original file is kept, and we check
            every logo before printing.
          </span>
        </p>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-6">
          <button
            type="button"
            className={link}
            onClick={() => {
              remove.reset();
              onChange(original);
            }}
            disabled={remove.isPending}
            data-testid="bg-undo"
          >
            <Undo2 className="size-3.5" aria-hidden /> Undo
          </button>
          {!logo.holes ? (
            <button
              type="button"
              className={link}
              onClick={() => run(original, true)}
              disabled={remove.isPending}
              title="Also clears enclosed areas of the background colour, like the inside of an O"
            >
              {remove.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Eraser className="size-3.5" aria-hidden />}
              Also clear inside letters
            </button>
          ) : null}
        </p>
        {error ? <p className={cn("mt-1.5 pl-6", dark ? "text-tf-yellow" : "text-tf-rust")}>{error}</p> : null}
      </div>
    );
  }

  if (isSvg(logo) || logo.analysis?.transparent) return null;
  const solid = Boolean(logo.analysis?.solidBackground);
  if (!solid && !always) return null;

  return (
    <div className={cn("text-[0.8rem] leading-snug", text, className)} data-testid="bg-remove-offer">
      <p className="flex items-start gap-2">
        <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", dark ? "text-tf-yellow" : "text-tf-rust")} aria-hidden />
        <span>
          {solid
            ? "This logo has a solid background built in, so it would print as a box."
            : "Got a white or coloured box around your logo?"}{" "}
          Remove it automatically — we&apos;ll keep your original file.
        </span>
      </p>
      <button
        type="button"
        className={cn(
          "btn-base mt-2 min-h-0 px-3 py-2 text-[0.78rem]",
          dark ? "btn-yellow" : "btn-secondary text-tf-navy",
        )}
        onClick={() => run(logo, false)}
        disabled={remove.isPending}
        data-testid="bg-remove"
      >
        {remove.isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Removing background…
          </>
        ) : (
          <>
            <Wand2 className="size-3.5" aria-hidden /> Remove background
          </>
        )}
      </button>
      {error ? <p className={cn("mt-1.5", dark ? "text-tf-yellow" : "text-tf-rust")}>{error}</p> : null}
    </div>
  );
}
