import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { stores, storeManagers } from "../db/schema.js";
import type { AuthTokenPayload } from "./jwt.js";

/**
 * The single choke point every staff endpoint MUST go through before
 * touching a store-scoped table. Never trust a storeId coming straight
 * from the client — this validates ownership against the caller's role
 * first.
 *
 * Missing-vs-foreign store both fail as NOT_FOUND on purpose: an admin
 * probing another account's store id should not be able to tell the
 * difference between "doesn't exist" and "isn't yours".
 */
export async function resolveStoreId(
  db: Database,
  user: AuthTokenPayload,
  storeId?: string,
): Promise<string> {
  switch (user.role) {
    case "platform_admin":
      return resolvePlatformAdmin(db, storeId);
    case "admin":
      return resolveAdmin(db, user, storeId);
    case "manager":
      return resolveManager(db, user, storeId);
    default:
      throw new TRPCError({ code: "FORBIDDEN", message: "Unknown role" });
  }
}

async function resolvePlatformAdmin(db: Database, storeId?: string): Promise<string> {
  if (!storeId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "platform_admin must specify a storeId explicitly",
    });
  }
  const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId));
  if (!store) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  return store.id;
}

async function resolveAdmin(
  db: Database,
  user: AuthTokenPayload,
  storeId?: string,
): Promise<string> {
  if (!user.accountId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin user missing accountId" });
  }

  if (storeId) {
    const [store] = await db
      .select({ id: stores.id, accountId: stores.accountId })
      .from(stores)
      .where(eq(stores.id, storeId));
    if (!store || store.accountId !== user.accountId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
    }
    return store.id;
  }

  const accountStores = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.accountId, user.accountId));

  if (accountStores.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Account has no stores" });
  }
  if (accountStores.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Account has multiple stores; specify storeId explicitly",
    });
  }
  return accountStores[0]!.id;
}

async function resolveManager(
  db: Database,
  user: AuthTokenPayload,
  storeId?: string,
): Promise<string> {
  if (storeId) {
    const [link] = await db
      .select({ storeId: storeManagers.storeId, accountId: stores.accountId })
      .from(storeManagers)
      .innerJoin(stores, eq(stores.id, storeManagers.storeId))
      .where(and(eq(storeManagers.userId, user.userId), eq(storeManagers.storeId, storeId)));

    if (!link || link.accountId !== user.accountId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
    }
    return link.storeId;
  }

  const managedStores = await db
    .select({ storeId: storeManagers.storeId })
    .from(storeManagers)
    .where(eq(storeManagers.userId, user.userId));

  if (managedStores.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Manager has no assigned stores" });
  }
  if (managedStores.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Manager has multiple stores; specify storeId explicitly",
    });
  }
  return managedStores[0]!.storeId;
}
