// In production the storefront and API share the same domain, so the
// backend resolves the store from the request's Host header (the
// customer's subdomain) automatically — the frontend doesn't need to know
// a storeId at all. On localhost there's no meaningful subdomain, so we
// fall back to a manually-entered slug, remembered in localStorage.

const SELECTED_SLUG_KEY = "konvert:selectedStoreSlug";

export function isLocalDev(): boolean {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function getSelectedStoreSlug(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_SLUG_KEY);
  } catch {
    return null;
  }
}

export function setSelectedStoreSlug(slug: string): void {
  try {
    window.localStorage.setItem(SELECTED_SLUG_KEY, slug);
  } catch {
    // localStorage unavailable (private browsing, etc.) — selection just won't persist.
  }
}
