import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { runableManagedAuth } from "@runablehq/managed-auth/server";
import { db } from "./database";
import { linkManagedToExistingEmail } from "./lib/managed-auth-link";

const managedConfig = {
  applicationId: process.env.APPLICATION_ID!,
  issuer: process.env.VITE_RUNABLE_AUTH_ISSUER!,
};

/**
 * Origins allowed to call the auth endpoints with cookies (Better Auth's CSRF / origin check).
 * Same-origin requests are always allowed (Origin host = Host header, which a browser can't
 * forge), plus the configured site URL, local dev, the production domain and the mobile
 * app's deep-link scheme. Add extra domains with TRUSTED_ORIGINS (comma separated, root .env).
 */
export function staticOrigins(): string[] {
  const list = [
    process.env.WEBSITE_URL,
    "http://localhost:4200",
    "https://tradieforms.com",
    "https://www.tradieforms.com",
    "runable-tradief-i9apr9c://",
    "runable-tradief-ahy55rn://",
    ...(process.env.TRUSTED_ORIGINS ?? "").split(","),
  ];
  return [
    ...new Set(
      list
        .map((o) => (o ?? "").trim())
        // Web origins have no trailing slash; app schemes keep theirs ("scheme://").
        .map((o) => (/^https?:\/\//i.test(o) ? o.replace(/\/+$/, "") : o))
        .filter(Boolean),
    ),
  ];
}

function sameOrigin(request: Request | undefined): string[] {
  const origin = request?.headers.get("origin");
  const host = request?.headers.get("host");
  if (!origin || !host) return [];
  try {
    return new URL(origin).host === host ? [origin] : [];
  } catch {
    return [];
  }
}

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: (request) => [...staticOrigins(), ...sameOrigin(request)],
  // Brute-force protection on sign-in / sign-up (per client IP, in memory, single process).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/*": { window: 60, max: 10 },
      "/sign-up/*": { window: 600, max: 10 },
      "/managed/exchange": { window: 60, max: 20 },
      "/change-password": { window: 600, max: 5 },
      "/get-session": false,
    },
  },
  advanced: {
    // The hosting edge (Cloudflare) sets these and overwrites client values; x-forwarded-for
    // (Better Auth's default) can be spoofed by the client.
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-real-ip"] },
  },
  plugins: [
    ...runableManagedAuth(managedConfig),
    // Lets Google sign-in reach accounts first created with email + password (same email).
    linkManagedToExistingEmail(managedConfig),
    expo(),
  ],
});
