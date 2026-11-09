import { ORPCError } from "@orpc/server";

/**
 * In-memory sliding-window rate limiter for public endpoints (single server process — the
 * pm2 config runs one instance). Limits are per client IP and per bucket name, so a busy
 * office on one IP shares a bucket; the numbers below are sized for that.
 *
 * Client IP: the hosting edge (Cloudflare → Google LB) sets `cf-connecting-ip` and
 * `x-real-ip` and overwrites any value the browser sends. `x-forwarded-for` is deliberately
 * NOT used — its left-most entry is client-controlled. If the site is ever moved behind a
 * proxy that does not set either header, every visitor falls into the "unknown" bucket and
 * the limits apply site-wide (fail closed rather than open).
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  ).slice(0, 64);
}

export interface Limit {
  /** Max requests per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Limits per feature. Generous for people, tight enough to stop scripted abuse. */
export const LIMITS = {
  contact: { max: 5, windowMs: 10 * 60_000 },
  "crew-deals": { max: 5, windowMs: 10 * 60_000 },
  "shipping-quote": { max: 5, windowMs: 10 * 60_000 },
  "order-create": { max: 20, windowMs: 10 * 60_000 },
  "order-read": { max: 600, windowMs: 10 * 60_000 },
  "order-payment": { max: 30, windowMs: 10 * 60_000 },
  /** Each check can query eWAY a few times — kept well under eWAY's own limits. */
  "order-payment-check": { max: 120, windowMs: 10 * 60_000 },
  quote: { max: 900, windowMs: 10 * 60_000 },
  "logo-upload": { max: 40, windowMs: 10 * 60_000 },
  "logo-sign": { max: 900, windowMs: 10 * 60_000 },
  "production-pdf": { max: 60, windowMs: 10 * 60_000 },
} satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

const hits = new Map<string, number[]>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000 && hits.size < 20_000) return;
  lastSweep = now;
  const longest = Math.max(...Object.values(LIMITS).map((l) => l.windowMs));
  for (const [key, times] of hits) {
    if (!times.length || now - times[times.length - 1]! > longest) hits.delete(key);
  }
}

/** Records one hit; returns seconds until the next allowed request when over the limit. */
export function hit(name: LimitName, ip: string, now = Date.now()): number | null {
  sweep(now);
  const { max, windowMs } = LIMITS[name];
  const key = `${name}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((windowMs - (now - recent[0]!)) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}

const MESSAGES: Partial<Record<LimitName, string>> = {
  contact:
    "Too many submissions from this connection. Wait a few minutes, or email info@tradieforms.com directly.",
  "crew-deals":
    "Too many submissions from this connection. Wait a few minutes, or email info@tradieforms.com directly.",
  "shipping-quote":
    "Too many quote requests from this connection. Wait a few minutes, or email info@tradieforms.com.",
  "logo-upload": "Too many uploads in a short time. Wait a few minutes and try again.",
};

/** oRPC guard: throws 429 TOO_MANY_REQUESTS when the caller is over the named limit. */
export function enforceLimit(name: LimitName, headers: Headers) {
  const retry = hit(name, clientIp(headers));
  if (retry != null) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: MESSAGES[name] ?? "Too many requests from this connection. Wait a minute and try again.",
      data: { retryAfterSeconds: retry },
    });
  }
}
