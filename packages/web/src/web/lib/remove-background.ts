/**
 * Automatic background removal for logos with a solid background box, done in the
 * browser on a canvas — nothing is sent anywhere until the result is uploaded.
 *
 * Method: find the dominant colour around the image border, then flood-fill inwards
 * from every edge pixel through pixels close to that colour. Filled pixels become
 * transparent; pixels on the boundary get a soft alpha (and the background colour is
 * un-blended from them) so edges don't keep a light or dark halo. Areas of the
 * background colour fully enclosed by the logo (e.g. inside an "O") are only cleared
 * when they're clearly part of the background (see `holes`). The original file is
 * never modified — the result is a new PNG.
 */

export interface RemovalResult {
  blob: Blob;
  /** Share of pixels made transparent (0–1). */
  removed: number;
  width: number;
  height: number;
}

const MAX_SIDE = 3000;
/** Colour distance (RGB, 0–441) treated as background, and the soft-edge range beyond it. */
const HARD = 42;
const SOFT = 90;

async function loadBitmap(source: Blob | string): Promise<ImageBitmap> {
  if (typeof source !== "string") return createImageBitmap(source);
  const res = await fetch(source, { mode: "cors" });
  if (!res.ok) throw new Error("Couldn't read the logo file. Upload it again to remove its background.");
  return createImageBitmap(await res.blob());
}

/** Most common colour on the border (quantised), averaged over its members. */
function borderColour(data: Uint8ClampedArray, w: number, h: number) {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 200) return;
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += data[i];
    e.g += data[i + 1];
    e.b += data[i + 2];
    buckets.set(k, e);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    add(0, y);
    add(w - 1, y);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best) return null;
  const border = 2 * (w + h);
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n, share: best.n / border };
}

export async function removeLogoBackground(
  source: Blob | string,
  options: { holes?: boolean } = {},
): Promise<RemovalResult> {
  const bitmap = await loadBitmap(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't edit images. Upload a transparent PNG instead.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  const bg = borderColour(data, w, h);
  if (!bg || bg.share < 0.5)
    throw new Error(
      "We couldn't find a single background colour around the edge of this logo, so nothing was removed.",
    );

  const n = w * h;
  const dist = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const dr = data[i] - bg.r;
    const dg = data[i + 1] - bg.g;
    const db = data[i + 2] - bg.b;
    dist[p] = Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // 1 = background reached from the edge, 2 = soft boundary pixel.
  const mark = new Uint8Array(n);
  const stack = new Int32Array(n);
  let top = 0;
  const seed = (p: number) => {
    if (!mark[p] && dist[p] < HARD) {
      mark[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (top > 0) {
    const p = stack[--top];
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < n - w) seed(p + w);
  }

  // Enclosed regions of the exact background colour (letter counters). Only cleared
  // when asked, since a white logo element on a white box looks identical.
  if (options.holes) {
    for (let p = 0; p < n; p++) if (!mark[p] && dist[p] < HARD * 0.6) mark[p] = 1;
  }

  // Boundary pixels next to removed background get partial alpha by colour distance.
  for (let p = 0; p < n; p++) {
    if (mark[p] || dist[p] >= SOFT) continue;
    const x = p % w;
    const touches =
      (x > 0 && mark[p - 1] === 1) ||
      (x < w - 1 && mark[p + 1] === 1) ||
      (p >= w && mark[p - w] === 1) ||
      (p < n - w && mark[p + w] === 1);
    if (touches) mark[p] = 2;
  }

  let removed = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (mark[p] === 1) {
      data[i + 3] = 0;
      removed++;
    } else if (mark[p] === 2) {
      const a = Math.min(1, Math.max(0.05, (dist[p] - HARD) / (SOFT - HARD)));
      // Un-blend the background colour so the edge keeps the logo's own colour.
      data[i] = Math.min(255, Math.max(0, (data[i] - bg.r * (1 - a)) / a));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - bg.g * (1 - a)) / a));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - bg.b * (1 - a)) / a));
      data[i + 3] = Math.round(data[i + 3] * a);
    }
  }
  if (removed / n > 0.985)
    throw new Error("That would remove almost the whole image, so nothing was changed.");
  if (removed === 0) throw new Error("No background was found to remove.");

  ctx.putImageData(img, 0, 0);
  let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  // Keep under the 5 MB upload limit.
  let side = Math.max(w, h);
  while (blob && blob.size > 4.8 * 1024 * 1024 && side > 600) {
    side = Math.round(side * 0.75);
    const s = side / Math.max(w, h);
    const small = document.createElement("canvas");
    small.width = Math.round(w * s);
    small.height = Math.round(h * s);
    small.getContext("2d")!.drawImage(canvas, 0, 0, small.width, small.height);
    blob = await new Promise<Blob | null>((r) => small.toBlob(r, "image/png"));
  }
  if (!blob) throw new Error("Couldn't create the transparent PNG.");
  return { blob, removed: removed / n, width: w, height: h };
}

/** "crew logo.jpg" → "crew logo-transparent.png" */
export function transparentName(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/-transparent$/i, "");
  return `${base}-transparent.png`;
}
