import { APIError, createAuthMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Lets Google (Runable managed auth) sign in to an account that already exists with the same
 * email — e.g. someone who signed up with email + password first.
 *
 * `@runablehq/managed-auth` only looks up users by their linked managed identity; when none is
 * linked it calls `createUser`, which fails on the unique email column, so the sign-in errors
 * and the Google name/photo never reach the account. This hook runs just before that exchange:
 * it verifies the same broker JWT and, when Google has verified the email, links the identity
 * to the existing user. The package then finds the link and updates the user's name and photo
 * from Google. Unverified emails are never linked (that would allow account takeover).
 */
const PROVIDER_ID = "runable"; // matches MANAGED_PROVIDER_ID in @runablehq/managed-auth

export function linkManagedToExistingEmail(config: { applicationId: string; issuer: string }): BetterAuthPlugin {
  const issuer = config.issuer.replace(/\/$/, "");
  const jwks = createRemoteJWKSet(new URL(`${issuer}/jwks`));

  return {
    id: "tradieforms-managed-link",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/managed/exchange",
          handler: createAuthMiddleware(async (ctx) => {
            const token = (ctx.body as { token?: unknown } | undefined)?.token;
            if (typeof token !== "string") return;
            // Invalid tokens are rejected by the package itself; nothing to do here.
            const verified = await jwtVerify(token, jwks, { issuer, audience: config.applicationId }).catch(() => null);
            if (!verified) return;
            const { sub, email, email_verified } = verified.payload as {
              sub?: string;
              email?: string;
              email_verified?: boolean;
            };
            if (typeof sub !== "string" || typeof email !== "string") return;

            const adapter = ctx.context.internalAdapter;
            if (await adapter.findAccountByProviderId(sub, PROVIDER_ID)) return; // already linked

            const existing = await adapter.findUserByEmail(email.toLowerCase());
            if (!existing) return; // brand-new user: the package creates it

            if (email_verified !== true) {
              throw new APIError("CONFLICT", {
                message:
                  "An account with this email already exists. Sign in with your email and password instead.",
              });
            }
            await adapter.linkAccount({ providerId: PROVIDER_ID, accountId: sub, userId: existing.user.id });
            if (!existing.user.emailVerified) await adapter.updateUser(existing.user.id, { emailVerified: true });
          }),
        },
      ],
    },
  };
}
