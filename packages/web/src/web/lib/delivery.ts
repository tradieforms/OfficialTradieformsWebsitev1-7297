import { useSyncExternalStore } from "react";
import type { ShippingZone } from "../../shared/shipping";

/**
 * The customer's delivery postcode (and optional zone correction), shared by the cart
 * estimator and the checkout address form so both quote the same shipping. Only the
 * postcode and correction are kept — the charge is always recomputed by the server.
 */
export interface DeliveryPrefs {
  postcode: string;
  /** Customer's correction of the detected zone; null = use the Australia Post list. */
  zone: ShippingZone | null;
}

const KEY = "tradieforms.delivery.v1";
const EMPTY: DeliveryPrefs = { postcode: "", zone: null };
const listeners = new Set<() => void>();
let state: DeliveryPrefs = EMPTY;
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw.postcode === "string")
      state = {
        postcode: raw.postcode.slice(0, 4),
        zone: raw.zone === "metro" || raw.zone === "regional" ? raw.zone : null,
      };
  } catch {
    state = EMPTY;
  }
}

function subscribe(fn: () => void) {
  load();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot() {
  load();
  return state;
}

export function setDelivery(patch: Partial<DeliveryPrefs>) {
  load();
  const next = { ...state, ...patch };
  // A new postcode clears an old correction — it was made for a different place.
  if (patch.postcode !== undefined && patch.postcode !== state.postcode && patch.zone === undefined)
    next.zone = null;
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}

export function useDelivery() {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
