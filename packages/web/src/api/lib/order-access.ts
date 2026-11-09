import { randomBytes, timingSafeEqual } from "node:crypto";
import { isAdmin, type AdminCandidate } from "./admin";

/** Crockford-style alphabet (no I, L, O, U) so references read clearly over the phone. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Random, unguessable reference body (crypto RNG, ~50 bits for 10 chars). */
export function randomReference(prefix: "TF" | "SQ", length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return `${prefix}-${out}`;
}

/** 32-byte secret that proves the holder placed the order (returned only on create). */
export function newAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface AccessibleOrder {
  userId: string | null;
  accessToken: string | null;
}

/**
 * An order can be read / paid by: the holder of its access token (the checkout that created
 * it), the signed-in account that placed it, or a verified admin. Anyone else gets NOT_FOUND
 * so references can't be probed.
 */
export function canAccessOrder(
  order: AccessibleOrder,
  token: string | null | undefined,
  user: (AdminCandidate & { id?: string }) | null | undefined,
): boolean {
  if (token && order.accessToken && sameToken(token, order.accessToken)) return true;
  if (user?.id && order.userId && user.id === order.userId) return true;
  return isAdmin(user);
}

/** Order row without its secrets — what customer-facing routes return. */
export function publicOrder<
  T extends { accessToken?: unknown; paymentRef?: unknown; paymentAttempts?: unknown; checkoutKey?: unknown },
>(order: T) {
  const {
    accessToken: _token,
    paymentRef: _ref,
    paymentAttempts: _attempts,
    checkoutKey: _key,
    ...rest
  } = order;
  return rest;
}
