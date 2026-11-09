import { z } from "zod";

/**
 * Stored logo keys are always `logos/<random>-<sanitised name>` (see routes/upload.ts).
 * Anything else — other bucket prefixes, `..`, slashes, URLs — is rejected, so a cart,
 * design or signed-URL request can never point at another object in the bucket.
 */
export const LOGO_KEY_PATTERN = /^logos\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

export function isLogoKey(key: string): boolean {
  return LOGO_KEY_PATTERN.test(key) && !key.includes("..");
}

export const logoKeyInput = z
  .string()
  .max(200)
  .refine(isLogoKey, { message: "That logo reference isn't valid. Upload the logo again." });
