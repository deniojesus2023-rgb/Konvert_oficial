import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { resolveStoreId } from "../../auth/access.js";
import { resolveStorefrontStore } from "../../storefront/resolveStore.js";
import { products } from "../../db/schema.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

export const productsRouter = router({
  /** Public storefront menu, scoped to a resolved store, active items only. */
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
      return ctx.db
        .select()
        .from(products)
        .where(and(eq(products.storeId, store.id), eq(products.active, true)));
    }),

  /** Staff view: ownership-checked via resolveStoreId, includes inactive items. */
  listAll: protectedProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input?.storeId);
      return ctx.db.select().from(products).where(eq(products.storeId, storeId));
    }),
});
