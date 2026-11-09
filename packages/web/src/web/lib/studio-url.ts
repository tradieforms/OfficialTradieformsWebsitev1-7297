/**
 * The Design Studio rewrites its own URL (e.g. `?design=12` after saving) so a
 * refresh reopens the same design. Wouter sees those replaceState calls as
 * navigation, so the page records the last self-written query here and skips
 * remounting the studio when the URL change came from the studio itself.
 */
let lastSelfSearch: string | null = null;

export function setStudioUrl(params: Record<string, string>) {
  const url = new URL(window.location.href);
  const search = new URLSearchParams(params).toString();
  lastSelfSearch = search;
  url.search = search;
  window.history.replaceState(window.history.state, "", url.toString());
}

/** True when `search` (no leading "?") is the query the studio last wrote itself. */
export function isStudioSelfUpdate(search: string) {
  return lastSelfSearch !== null && search.replace(/^\?/, "") === lastSelfSearch;
}
