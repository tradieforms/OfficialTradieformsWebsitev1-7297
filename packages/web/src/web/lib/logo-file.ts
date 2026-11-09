/** Client-side checks for uploaded logos (the API enforces the same rules). */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export function validateLogoFile(file: File): string | null {
  if (!LOGO_TYPES.includes(file.type as (typeof LOGO_TYPES)[number])) {
    const ext = file.name.split(".").pop()?.toUpperCase() ?? "That";
    return `${ext} files aren't supported. Upload a PNG (best for transparent logos), SVG, WEBP or JPG.`;
  }
  if (file.size > LOGO_MAX_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB. Export a smaller PNG or an SVG.`;
  }
  if (file.size === 0) return "That file is empty.";
  return null;
}

export interface LogoAnalysis {
  /** True when the file has any transparent pixels. */
  transparent: boolean;
  /** True when the outer edge is a single opaque colour — likely a baked-in background box. */
  solidBackground: boolean;
  width: number;
  height: number;
}

/**
 * Reads the file's own pixels to tell the customer whether it will print as a
 * clean shape or as a rectangle. Nothing is modified — the original file is
 * what gets uploaded.
 */
export async function analyseLogo(file: File): Promise<LogoAnalysis | null> {
  if (file.type === "image/svg+xml") {
    return { transparent: true, solidBackground: false, width: 0, height: 0 };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const w = Math.min(bitmap.width, 400);
    const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let transparent = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) {
        transparent = true;
        break;
      }
    }
    // Sample the border: all opaque and near one colour => solid background.
    const edge: number[] = [];
    const push = (x: number, y: number) => edge.push((y * w + x) * 4);
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 40))) {
      push(x, 0);
      push(x, h - 1);
    }
    for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 40))) {
      push(0, y);
      push(w - 1, y);
    }
    const [r0, g0, b0] = [data[edge[0]], data[edge[0] + 1], data[edge[0] + 2]];
    const solidBackground = edge.every(
      (i) =>
        data[i + 3] > 245 &&
        Math.abs(data[i] - r0) < 18 &&
        Math.abs(data[i + 1] - g0) < 18 &&
        Math.abs(data[i + 2] - b0) < 18,
    );
    return { transparent, solidBackground, width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  }
}

/** Resolves true if the image at `url` loads. */
export function imageLoads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
