/** Server-side logo rules (the browser checks the same in web/lib/logo-file.ts). */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  sig.every((b, i) => bytes[offset + i] === b);

/**
 * Patterns that make an SVG active content rather than a picture. A logo never needs any of
 * these; rejecting them stops a stored-XSS SVG even if it is ever opened directly.
 */
const SVG_FORBIDDEN: [RegExp, string][] = [
  [/<script[\s>/]/i, "script"],
  [/\son[a-z]+\s*=/i, "event handler"],
  [/javascript\s*:/i, "javascript: link"],
  [/<foreignObject[\s>/]/i, "embedded HTML"],
  [/<!ENTITY/i, "XML entity"],
  [/<iframe|<embed|<object/i, "embedded content"],
  [/(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|data:text\/html)/i, "external reference"],
  [/@import|url\(\s*["']?\s*(?:https?:|\/\/)/i, "external stylesheet"],
];

/** Returns a customer-readable problem, or null when the bytes match the declared type. */
export function sniffLogo(type: LogoType, bytes: Uint8Array): string | null {
  const mismatch = "That file's contents don't match its type. Re-export it as a PNG, JPG, WEBP or SVG.";
  switch (type) {
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? null : mismatch;
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]) ? null : mismatch;
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
        ? null
        : mismatch;
    case "image/svg+xml": {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (!/<svg[\s>]/i.test(text.slice(0, 4096)) || text.includes("\u0000")) return mismatch;
      for (const [re, what] of SVG_FORBIDDEN) {
        if (re.test(text))
          return `That SVG contains active content (${what}), which we can't accept. Export a plain SVG or a PNG.`;
      }
      return null;
    }
  }
}
