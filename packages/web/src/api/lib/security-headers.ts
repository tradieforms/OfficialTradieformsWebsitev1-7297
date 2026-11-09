import type { MiddlewareHandler } from "hono";
import { staticOrigins } from "../auth";

/**
 * Response headers for every /api response (JSON, PDFs, auth). Page/static responses are
 * served by the template server and need the same headers set at the hosting edge — see
 * docs/security-audit.md.
 */
export const apiSecurityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  h.set("Cross-Origin-Resource-Policy", "same-site");
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard for state-changing API calls. A browser always sends `Origin` on cross-site
 * POSTs; it must be this site (same host) or a configured trusted origin. Requests without
 * an Origin header come from non-browser clients (the mobile app, server-to-server), which
 * cannot ride on a visitor's cookies, so they are allowed through to normal auth checks.
 */
/** True when `origin` is this site (same host as the request) or a configured trusted origin. */
export function isTrustedOrigin(origin: string, requestHost: string | undefined): boolean {
  if (staticOrigins().includes(origin)) return true;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export const originGuard: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header("origin");
  if (!origin) return next();
  if (origin !== "null" && isTrustedOrigin(origin, c.req.header("host"))) return next();
  return c.json({ error: "Cross-site request blocked." }, 403);
};

const CORS_GRANTS = [
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Methods",
  "Access-Control-Expose-Headers",
];

/**
 * The template's CORS layer reflects any Origin with credentials. This narrows it: a
 * response to an untrusted Origin carries no CORS grant, so another website cannot read
 * API responses (session details, order data, PDFs) with a visitor's cookies, and its
 * preflights fail. Same-origin pages, the mobile app and trusted origins are unaffected.
 */
export const corsAllowList: MiddlewareHandler = async (c, next) => {
  await next();
  const origin = c.req.header("origin");
  if (!origin || isTrustedOrigin(origin, c.req.header("host"))) return;
  for (const h of CORS_GRANTS) c.res.headers.delete(h);
};
