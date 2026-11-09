"""
Pre-renders the "preview tint" garment colours as real PNG cutouts.

Why: the old approach painted a flat colour over the photo with a CSS blend
mode at 82-90% opacity, which washed garments out (grey, translucent, flat).
This script instead re-shades the target colour with the source photo's own
luminance, so folds, seams, stitching, shadows and highlights carry over and
the alpha channel (transparent background) is preserved exactly.

Method (linear light):
  1. luminance of every garment pixel relative to the garment's median tone
  2. converted to stops (log2), spread normalised, soft-clipped with tanh
  3. applied to the target colour: darker stops multiply it, brighter stops
     lift it towards white
Pixels that are colourful in the source (e.g. polo collar tipping) are
recoloured too - that limitation is flagged in the UI as "Preview tint".

Run: python3 tools/recolour-garments.py   (from the repo root)
"""
import json
import pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CUT = ROOT / "packages/web/public/images/cutouts"

# (source cutout, target hex, output name)
JOBS = [
    ("jacketb-black-front.png", "#12305C", "jacketb-navy-front-recolour.png"),
    ("jacketb-black-back.png", "#12305C", "jacketb-navy-back-recolour.png"),
    ("jacketb-black-front.png", "#3C4149", "jacketb-charcoal-front-recolour.png"),
    ("jacketb-black-back.png", "#3C4149", "jacketb-charcoal-back-recolour.png"),
    # Crewneck Jacket: navy is the supplier photo (session 16); olive retired.
    ("jacket-navy-front.png", "#15171A", "jacket-black-front-recolour.png"),
    ("jacket-navy-back.png", "#15171A", "jacket-black-back-recolour.png"),
    # Tank top: the only back photo is charcoal; black/white backs and the charcoal front are tints.
    ("tank-charcoal-back.png", "#15171A", "tank-black-back-recolour.png"),
    ("tank-charcoal-back.png", "#F2F1EC", "tank-white-back-recolour.png"),
    ("tank-black-front.png", "#4F4C53", "tank-charcoal-front-recolour.png"),
    ("vest-black-front.png", "#F2F1EC", "vest-white-front-recolour.png"),
    ("vest-black-back.png", "#F2F1EC", "vest-white-back-recolour.png"),
    ("vest-black-front.png", "#12305C", "vest-navy-front-recolour.png"),
    ("vest-black-back.png", "#12305C", "vest-navy-back-recolour.png"),
    ("vest-black-front.png", "#B4232A", "vest-red-front-recolour.png"),
    ("vest-black-back.png", "#B4232A", "vest-red-back-recolour.png"),
    ("hoodie-navy-back.png", "#F2F1EC", "hoodie-white-back-recolour.png"),
    ("polo-white-front.png", "#12305C", "polo-navy-front-recolour.png"),
    ("polo-white-back.png", "#12305C", "polo-navy-back-recolour.png"),
    ("tshirt-black-front.png", "#F2F1EC", "tshirt-white-front-recolour.png"),
    ("tshirt-black-front.png", "#12305C", "tshirt-navy-front-recolour.png"),
    ("cap-black-front.png", "#12305C", "cap-navy-front-recolour.png"),
    ("cap-black-front.png", "#F2F1EC", "cap-white-front-recolour.png"),
]


def srgb2lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def hex2lin(h):
    return srgb2lin(np.array([int(h[i : i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32))


def recolour(src: pathlib.Path, target_hex: str) -> tuple[Image.Image, str]:
    im = np.asarray(Image.open(src).convert("RGBA")).astype(np.float32) / 255
    rgb, a = im[..., :3], im[..., 3]
    lin = srgb2lin(rgb)
    lum = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    mask = a > 0.6
    ref = float(np.median(lum[mask]))
    stops = np.log2(np.clip(lum / max(ref, 1e-4), 1e-4, None))
    spread = float(np.std(stops[mask]))
    stops = stops * min(1.0, 0.7 / max(spread, 1e-3))
    stops = 1.6 * np.tanh(stops / 1.6)
    f = np.power(2.0, stops)[..., None]
    t = hex2lin(target_hex)
    out = np.where(f <= 1, t * f, 1 - np.power(1 - t, f))
    srgb = lin2srgb(out)
    mean = (srgb[mask].mean(axis=0) * 255).astype(int)
    res = np.dstack([srgb, a])  # alpha untouched
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), "RGBA"), "#%02X%02X%02X" % tuple(mean)


if __name__ == "__main__":
    report = {}
    for src, hexc, out in JOBS:
        img, mean = recolour(CUT / src, hexc)
        img.save(CUT / out, optimize=True)
        report[out] = {"source": src, "target": hexc, "garmentMean": mean}
        print(f"{out:40s} target {hexc} mean {mean}")
    (ROOT / "tools/recolour-report.json").write_text(json.dumps(report, indent=2))
