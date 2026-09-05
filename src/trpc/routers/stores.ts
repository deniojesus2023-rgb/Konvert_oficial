import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { resolveStoreId } from "../../auth/access.js";
import { getActiveStoreBySlug, resolveStorefrontStore } from "../../storefront/resolveStore.js";
import { stores } from "../../db/schema.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

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

  /** Stores visible to the caller, scoped by role (never cross-account). */
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "platform_admin") {
      return ctx.db.select().from(stores);
    }
    if (ctx.user.role === "admin" && ctx.user.accountId) {
      return ctx.db.select().from(stores).where(eq(stores.accountId, ctx.user.accountId));
    }
    // manager: only the stores they're explicitly linked to
    const storeId = await resolveStoreId(ctx.db, ctx.user).catch(() => null);
    if (!storeId) return [];
    return ctx.db.select().from(stores).where(eq(stores.id, storeId));
  }),

  getById: protectedProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      const [store] = await ctx.db.select().from(stores).where(eq(stores.id, storeId));
      return store;
    }),
});
