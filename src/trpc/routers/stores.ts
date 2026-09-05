import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { resolveStoreId } from "../../auth/access.js";
import { getActiveStoreBySlug, resolveStorefrontStore } from "../../storefront/resolveStore.js";
import { stores } from "../../db/schema.js";
import type { Database } from "../../db/client.js";
import type { AuthTokenPayload } from "../../auth/jwt.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

async function listStoresForUser(db: Database, user: AuthTokenPayload) {
  if (user.role === "platform_admin") {
    return db.select().from(stores);
  }
  if (user.role === "admin" && user.accountId) {
    return db.select().from(stores).where(eq(stores.accountId, user.accountId));
  }
  // manager: only the store(s) they're explicitly linked to
  const storeId = await resolveStoreId(db, user).catch(() => null);
  if (!storeId) return [];
  return db.select().from(stores).where(eq(stores.id, storeId));
}

export const storesRouter = router({
  /**
   * Public branding lookup for the storefront: resolves by explicit
   * storeId/slug (dev, mobile apps), or falls back to the request's Host
   * header (production subdomains). Never leaks anything beyond branding.
   */
  getBySlugOrHost: publicProcedure
    .input(z.object({ storeId: z.string().optional(), slug: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const store = input?.slug
        ? await getActiveStoreBySlug(ctx.db, input.slug)
        : await resolveStorefrontStore(ctx.db, { storeId: input?.storeId, host: ctx.host });

      if (!store) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }

      return {
        id: store.id,
        name: store.name,
        publicSlug: store.publicSlug,
        primaryColor: store.primaryColor,
        logoUrl: store.logoUrl,
      };
    }),

  /**
   * Stores visible to the caller, scoped by role — never a raw SELECT *.
   * admin: only their account's stores. manager: only the store(s) linked
   * via store_managers. platform_admin: every store. This is what powers
   * the store switcher in the admin panel (only shown when it returns
   * more than one store).
   */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return listStoresForUser(ctx.db, ctx.user);
  }),

  /** @deprecated kept for the phase-1/2 callers; same as listMine. */
  list: protectedProcedure.query(async ({ ctx }) => {
    return listStoresForUser(ctx.db, ctx.user);
  }),

  getById: protectedProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      const [store] = await ctx.db.select().from(stores).where(eq(stores.id, storeId));
      return store;
    }),
});
