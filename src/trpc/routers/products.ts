import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertOwnedByStore, resolveStoreId } from "../../auth/access.js";
import { resolveStorefrontStore } from "../../storefront/resolveStore.js";
import { categories, products } from "../../db/schema.js";
import type { Database } from "../../db/client.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

async function getOwnedProduct(db: Database, productId: string, storeId: string) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  return assertOwnedByStore(product, storeId, "Product not found");
}

/** A product's category must belong to the very same store as the product. */
async function assertCategoryInStore(db: Database, categoryId: string, storeId: string) {
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId));
  assertOwnedByStore(category, storeId, "Category not found");
}

const priceInput = z
  .number()
  .nonnegative()
  .transform((value) => value.toFixed(2));

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

  create: protectedProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        categoryId: z.string(),
        name: z.string().min(1).max(191),
        description: z.string().max(2000).optional(),
        price: priceInput,
        imageUrl: z.string().url().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      await assertCategoryInStore(ctx.db, input.categoryId, storeId);

      const id = randomUUID();
      await ctx.db.insert(products).values({
        id,
        storeId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description ?? null,
        price: input.price,
        imageUrl: input.imageUrl ?? null,
        active: input.active ?? true,
      });

      const [created] = await ctx.db.select().from(products).where(eq(products.id, id));
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        storeId: z.string().optional(),
        categoryId: z.string().optional(),
        name: z.string().min(1).max(191).optional(),
        description: z.string().max(2000).nullable().optional(),
        price: priceInput.optional(),
        imageUrl: z.string().url().nullable().optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      await getOwnedProduct(ctx.db, input.productId, storeId);

      if (input.categoryId !== undefined) {
        await assertCategoryInStore(ctx.db, input.categoryId, storeId);
      }

      const patch: Partial<typeof products.$inferInsert> = {};
      if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.price !== undefined) patch.price = input.price;
      if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
      if (input.active !== undefined) patch.active = input.active;

      if (Object.keys(patch).length > 0) {
        await ctx.db.update(products).set(patch).where(eq(products.id, input.productId));
      }

      const [updated] = await ctx.db.select().from(products).where(eq(products.id, input.productId));
      return updated;
    }),

  /**
   * Soft delete only: a product may already have order_items pointing at
   * it (unitPrice snapshot depends on the row still existing), so it is
   * never physically deleted — just hidden from the public menu.
   */
  delete: protectedProcedure
    .input(z.object({ productId: z.string(), storeId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      await getOwnedProduct(ctx.db, input.productId, storeId);
      await ctx.db.update(products).set({ active: false }).where(eq(products.id, input.productId));
      return { id: input.productId, active: false };
    }),
});
