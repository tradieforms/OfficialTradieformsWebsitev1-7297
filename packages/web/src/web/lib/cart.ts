import { useSyncExternalStore } from "react";
import type { PlacedLogo } from "../../shared/placements";

/**
 * A logo on one view of a garment. New data always carries `placementId` (one of the
 * product's fixed spots) plus its `production` spec; x/y/scale/height are the preview box.
 */
export type LogoTransform = PlacedLogo;

export interface CartSizeEntry {
  slug: string;
  size: string;
  quantity: number;
  /** Garment colour for this entry (bundle kits allow a colour per row). */
  colourId?: string;
  /** Product variant (fabric / style option); omitted = the product's default. */
  variantId?: string;
}

/**
 * Logo placement for one garment in a bundle kit (a product + colour; every
 * size of that garment shares it). Front and back are independent; null means
 * no logo on that view.
 */
export interface KitPlacement {
  slug: string;
  colourId: string;
  frontLogo: LogoTransform | null;
  backLogo: LogoTransform | null;
}

export interface CartLine {
  id: string;
  kind: "product" | "bundle";
  slug: string;
  label: string;
  colourId?: string;
  colourName?: string;
  /** Product variant (fabric / style option); omitted = the product's default. */
  variantId?: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  /** Display image (catalogue path, or a data URL for a tinted preview). */
  image?: string;
  logoKey?: string | null;
  logoName?: string | null;
  logoUrl?: string | null;
  frontLogo?: LogoTransform | null;
  backLogo?: LogoTransform | null;
  sizes?: CartSizeEntry[];
  colourIds?: Record<string, string>;
  /** Bundle kits: per-garment logo placement, one entry per product + colour. */
  placements?: KitPlacement[];
}

const KEY = "tradieforms.cart.v1";
const listeners = new Set<() => void>();
let lines: CartLine[] = [];
let loaded = false;

function emit() {
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable — cart stays in memory for this session */
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) lines = parsed;
    }
  } catch {
    lines = [];
  }
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      loaded = false;
      ensureLoaded();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot() {
  ensureLoaded();
  return lines;
}

export function addLine(line: Omit<CartLine, "id">) {
  ensureLoaded();
  // Identical configuration merges into the existing line.
  const signature = JSON.stringify([
    line.kind,
    line.slug,
    line.variantId,
    line.colourId,
    line.size,
    line.logoKey,
    line.frontLogo,
    line.backLogo,
    line.sizes,
    line.colourIds,
    line.placements,
  ]);
  const existing = lines.find(
    (l) =>
      JSON.stringify([
        l.kind,
        l.slug,
        l.variantId,
        l.colourId,
        l.size,
        l.logoKey,
        l.frontLogo,
        l.backLogo,
        l.sizes,
        l.colourIds,
        l.placements,
      ]) === signature,
  );
  if (existing) {
    lines = lines.map((l) =>
      l.id === existing.id ? { ...l, quantity: Math.min(999, l.quantity + line.quantity) } : l,
    );
  } else {
    lines = [...lines, { ...line, id: crypto.randomUUID() }];
  }
  persist();
  emit();
}

/** Swaps a line for an edited version, keeping its position and quantity. */
export function replaceLine(id: string, line: Omit<CartLine, "id" | "quantity">) {
  ensureLoaded();
  if (!lines.some((l) => l.id === id)) return false;
  lines = lines.map((l) => (l.id === id ? { ...line, id, quantity: l.quantity } : l));
  persist();
  emit();
  return true;
}

export function setQuantity(id: string, quantity: number) {
  ensureLoaded();
  if (quantity < 1) {
    removeLine(id);
    return;
  }
  lines = lines.map((l) => (l.id === id ? { ...l, quantity: Math.min(999, quantity) } : l));
  persist();
  emit();
}

export function removeLine(id: string) {
  ensureLoaded();
  lines = lines.filter((l) => l.id !== id);
  persist();
  emit();
}

export function clearCart() {
  ensureLoaded();
  lines = [];
  persist();
  emit();
}

export function cartSubtotal(list: CartLine[]) {
  return list.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

export function cartPieces(list: CartLine[]) {
  return list.reduce(
    (sum, l) =>
      sum + (l.kind === "bundle" ? l.sizes?.reduce((s, e) => s + e.quantity, 0) ?? 0 : l.quantity),
    0,
  );
}

export function useCart() {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    lines: list,
    count: list.length,
    pieces: cartPieces(list),
    subtotal: cartSubtotal(list),
    addLine,
    replaceLine,
    setQuantity,
    removeLine,
    clearCart,
  };
}
