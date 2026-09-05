import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { resolveStoreId } from "../../auth/access.js";
import { resolveStorefrontStore } from "../../storefront/resolveStore.js";
import { categories } from "../../db/schema.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

export const categoriesRouter = router({
  /** Public storefront menu categories, scoped to a resolved store only. */
  list: publicProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const store = await resolveStorefrontStore(ctx.db, {
        storeId: input?.storeId,
        host: ctx.host,
      });
      if (!store) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }
      return ctx.db.select().from(categories).where(eq(categories.storeId, store.id));
    }),

  /** Staff view: same data, but ownership-checked via resolveStoreId. */
  listAll: protectedProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input?.storeId);
      return ctx.db.select().from(categories).where(eq(categories.storeId, storeId));
    }),
});
