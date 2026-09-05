import { z } from "zod";
import { eq } from "drizzle-orm";
import { resolveStoreId } from "../../auth/access.js";
import { stores } from "../../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

export const storesRouter = router({
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
