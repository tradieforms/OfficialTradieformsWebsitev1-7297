import { useSyncExternalStore } from "react";
import type { LogoTransform } from "./cart";

/**
 * Guest design drafts. Stored only in this browser's localStorage — they are
 * not sent to TradieForms and are lost if site data is cleared or a different
 * browser/device is used. The logo file itself is uploaded to storage so it
 * can be reloaded; the draft keeps its storage key.
 */
export interface GuestDraft {
  id: string;
  name: string;
  productSlug: string;
  /** Product variant; missing on drafts saved before variants existed. */
  variantId?: string | null;
  colourId: string;
  size: string;
  view: "front" | "back";
  logoKey: string | null;
  logoName: string | null;
  frontLogo: LogoTransform | null;
  backLogo: LogoTransform | null;
  updatedAt: number;
}

const KEY = "tradieforms.drafts.v1";
const MAX = 20;
const listeners = new Set<() => void>();
let cache: GuestDraft[] | null = null;
const EMPTY: GuestDraft[] = [];

function read(): GuestDraft[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(parsed)
      ? (parsed.filter(
          (d) => d && typeof d === "object" && typeof (d as GuestDraft).id === "string",
        ) as GuestDraft[])
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: GuestDraft[]): boolean {
  cache = next;
  let ok = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    ok = false;
  }
  for (const l of listeners) l();
  return ok;
}

export function listDrafts(): GuestDraft[] {
  return read();
}

export function getDraft(id: string): GuestDraft | undefined {
  return read().find((d) => d.id === id);
}

/** Inserts or updates a draft. Returns the saved draft, or null if storage is unavailable. */
export function saveDraft(draft: Omit<GuestDraft, "id" | "updatedAt"> & { id?: string }): GuestDraft | null {
  const id = draft.id ?? `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const saved: GuestDraft = { ...draft, id, updatedAt: Date.now() };
  const rest = read().filter((d) => d.id !== id);
  const ok = write([saved, ...rest].slice(0, MAX));
  return ok ? saved : null;
}

export function deleteDraft(id: string) {
  write(read().filter((d) => d.id !== id));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDrafts(): GuestDraft[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
