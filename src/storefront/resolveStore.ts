import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { stores } from "../db/schema.js";

const HOST_CACHE_TTL_MS = 30_000;

export interface StorefrontStore {
  id: string;
  accountId: string;
  name: string;
  publicSlug: string;
  primaryColor: string | null;
  logoUrl: string | null;
  status: string;
}

interface CacheEntry {
  store: StorefrontStore | null;
  expiresAt: number;
}

/**
 * Keyed by subdomain, not full host, so the same store resolves from any
 * port during local/dev testing. Short TTL trades a little staleness for
 * not hitting the DB on every storefront request.
 */
const hostCache = new Map<string, CacheEntry>();

/** Test-only: the cache is process-wide and must not leak between tests. */
export function clearStorefrontCache(): void {
  hostCache.clear();
}

/**
 * Pulls the subdomain out of a Host header. Returns null when there isn't
 * one to resolve against (localhost, bare apex domain, www/api) — callers
 * must then fall back to an explicit storeId from the client.
 */
export function extractSubdomain(host: string | undefined | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]!.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  const parts = hostname.split(".");
  if (parts.length < 3) return null; // e.g. "konvert.app" — no subdomain

  const subdomain = parts[0]!;
  if (subdomain === "www" || subdomain === "api") return null;
  return subdomain;
}

function toStorefrontStore(row: typeof stores.$inferSelect): StorefrontStore {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    publicSlug: row.publicSlug,
    primaryColor: row.primaryColor,
    logoUrl: row.logoUrl,
    status: row.status,
  };
}

export async function getActiveStoreById(
  db: Database,
  storeId: string,
): Promise<StorefrontStore | null> {
  const [row] = await db.select().from(stores).where(eq(stores.id, storeId));
  return row && row.status === "active" ? toStorefrontStore(row) : null;
}

export async function getActiveStoreBySlug(
  db: Database,
  publicSlug: string,
): Promise<StorefrontStore | null> {
  const [row] = await db.select().from(stores).where(eq(stores.publicSlug, publicSlug));
  return row && row.status === "active" ? toStorefrontStore(row) : null;
}

/**
 * The storefront "middleware" resolver: given a Host header, resolves the
 * store via its subdomain, caching the result for HOST_CACHE_TTL_MS so a
 * burst of storefront traffic doesn't hit the DB per-request.
 */
export async function resolveStoreFromHost(
  db: Database,
  host: string | undefined | null,
): Promise<StorefrontStore | null> {
  const subdomain = extractSubdomain(host);
  if (!subdomain) return null;

  const cached = hostCache.get(subdomain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.store;
  }

  const store = await getActiveStoreBySlug(db, subdomain);
  hostCache.set(subdomain, { store, expiresAt: Date.now() + HOST_CACHE_TTL_MS });
  return store;
}

/**
 * The single entry point every public storefront endpoint must use.
 * An explicit storeId from the client always wins (mobile apps/PWAs with
 * no subdomain of their own); otherwise falls back to host-based
 * resolution. Never guesses — returns null rather than defaulting to
 * "the first store" or similar.
 */
export async function resolveStorefrontStore(
  db: Database,
  input: { storeId?: string; host?: string | null },
): Promise<StorefrontStore | null> {
  if (input.storeId) return getActiveStoreById(db, input.storeId);
  if (input.host) return resolveStoreFromHost(db, input.host);
  return null;
}
