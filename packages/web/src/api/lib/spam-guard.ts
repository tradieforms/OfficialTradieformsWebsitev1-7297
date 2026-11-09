import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { enforceLimit } from "./rate-limit";

/**
 * Lightweight spam protection for public forms, no third-party script needed:
 *  - honeypot: a hidden "website" field real visitors never fill in;
 *  - minimum fill time: the form must have been open for at least 3 seconds (else a retry message);
 *  - per-IP rate limit: at most 5 submissions per form per 10 minutes (see lib/rate-limit.ts).
 */
export const spamFields = {
  website: z.string().max(200).optional().nullable(),
  startedAt: z.number().int().optional().nullable(),
};

/** Returns true when the submission looks automated and should be silently dropped. */
export function checkSpam(
  form: "contact" | "crew-deals",
  headers: Headers,
  input: { website?: string | null; startedAt?: number | null },
): boolean {
  enforceLimit(form, headers);

  // Honeypot filled: almost certainly a bot, so drop it quietly.
  if (input.website?.trim()) return true;
  // Too fast to be typed. A person with autofill could also trip this, so tell them
  // instead of pretending it was sent.
  if (input.startedAt && Date.now() - input.startedAt < 3000) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That was a bit quick for us. Give it a few seconds and press send again.",
    });
  }
  return false;
}

/**
 * Single-line text for email subjects and headers: control characters (CR/LF included)
 * become spaces so a value can never start a new header line.
 */
export const singleLine = (s: string) => s.replace(/\p{Cc}+/gu, " ").trim();
