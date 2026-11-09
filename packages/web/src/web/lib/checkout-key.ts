/**
 * One random key per checkout attempt, kept in sessionStorage. The same cart + details give
 * the same key, so a double click, a retry after a network error or the back button returns
 * the order the server already created instead of a second one. Any change to the cart or
 * the details starts a new attempt (new key).
 */
const STORE = "tf-checkout-key";

function randomKey() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function checkoutKeyFor(signature: string): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as { sig?: string; key?: string } | null;
    if (saved?.sig === signature && saved.key) return saved.key;
    const key = randomKey();
    sessionStorage.setItem(STORE, JSON.stringify({ sig: signature, key }));
    return key;
  } catch {
    return randomKey();
  }
}

/** Called once the order is handed to payment — the next checkout is a new attempt. */
export function forgetCheckoutKey() {
  try {
    sessionStorage.removeItem(STORE);
  } catch {
    // storage unavailable — nothing to forget
  }
}
