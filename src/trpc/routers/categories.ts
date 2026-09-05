import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertOwnedByStore, resolveStoreId } from "../../auth/access.js";
import { resolveStorefrontStore } from "../../storefront/resolveStore.js";
import { categories } from "../../db/schema.js";
import type { Database } from "../../db/client.js";
import { slugify } from "../../util/slug.js";
import { isDuplicateKeyError } from "../../util/dbErrors.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

async function getOwnedCategory(db: Database, categoryId: string, storeId: string) {
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId));
  return assertOwnedByStore(category, storeId, "Category not found");
}

export const categoriesRouter = router({
  /** Public storefront menu categories, scoped to a resolved store, active only. */
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
        .from(categories)
        .where(eq(categories.storeId, store.id))
        .then((rows) => rows.filter((row) => row.active));
    }),

  /** Staff view: ownership-checked via resolveStoreId, includes inactive categories. */
  listAll: protectedProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input?.storeId);
      return ctx.db.select().from(categories).where(eq(categories.storeId, storeId));
    }),

  create: protectedProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        name: z.string().min(1).max(191),
        slug: z.string().min(1).max(191).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      const id = randomUUID();
      const slug = slugify(input.slug ?? input.name) || "categoria";

      try {
        await ctx.db.insert(categories).values({ id, storeId, name: input.name, slug });
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          throw new TRPCError({ code: "CONFLICT", message: "A category with this slug already exists" });
        }
        throw err;
      }

      const [created] = await ctx.db.select().from(categories).where(eq(categories.id, id));
      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        categoryId: z.string(),
        storeId: z.string().optional(),
        name: z.string().min(1).max(191).optional(),
        slug: z.string().min(1).max(191).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      await getOwnedCategory(ctx.db, input.categoryId, storeId);

      const patch: Partial<typeof categories.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.slug !== undefined) patch.slug = slugify(input.slug) || "categoria";

      if (Object.keys(patch).length > 0) {
        try {
          await ctx.db.update(categories).set(patch).where(eq(categories.id, input.categoryId));
        } catch (err) {
          if (isDuplicateKeyError(err)) {
            throw new TRPCError({ code: "CONFLICT", message: "A category with this slug already exists" });
          }
          throw err;
        }
      }

      const [updated] = await ctx.db.select().from(categories).where(eq(categories.id, input.categoryId));
      return updated;
    }),

  /** Soft delete only — a category may already have products (and those, orders). */
  delete: protectedProcedure
    .input(z.object({ categoryId: z.string(), storeId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      await getOwnedCategory(ctx.db, input.categoryId, storeId);
      await ctx.db.update(categories).set({ active: false }).where(eq(categories.id, input.categoryId));
      return { id: input.categoryId, active: false };
    }),
});
