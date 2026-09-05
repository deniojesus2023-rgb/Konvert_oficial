import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { resolveStoreId } from "../../auth/access.js";
import { getActiveStoreById } from "../../storefront/resolveStore.js";
import { orderItems, orders, products } from "../../db/schema.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

const createOrderInput = z.object({
  storeId: z.string(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  deliveryAddress: z.string().min(1).max(1000),
  paymentMethod: z.literal("cash_on_delivery"),
});

export const ordersRouter = router({
  /**
   * Storefront checkout. storeId is explicit and required (never inferred
   * from Host here — money flow shouldn't depend on ambiguous resolution).
   * Every product referenced by an item is re-checked against that exact
   * storeId: a cart built client-side from mixed stores is rejected wholesale
   * rather than silently dropping/reassigning the offending items.
   */
  create: publicProcedure.input(createOrderInput).mutation(async ({ ctx, input }) => {
    const store = await getActiveStoreById(ctx.db, input.storeId);
    if (!store) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const foundProducts = await ctx.db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));

    const productsById = new Map(foundProducts.map((product) => [product.id, product]));

    for (const productId of productIds) {
      const product = productsById.get(productId);
      if (!product || product.storeId !== input.storeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Product ${productId} does not belong to store ${input.storeId}`,
        });
      }
      if (!product.active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Product ${productId} is not available`,
        });
      }
    }

    let total = 0;
    const orderId = randomUUID();
    const itemRows = input.items.map((item) => {
      const product = productsById.get(item.productId)!;
      const unitPrice = product.price; // snapshot, taken once, never recomputed later
      total += Number(unitPrice) * item.quantity;
      return {
        id: randomUUID(),
        storeId: input.storeId,
        orderId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
      };
    });

    await ctx.db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: orderId,
        storeId: input.storeId,
        userId: ctx.user?.userId ?? null,
        deliveryAddress: input.deliveryAddress,
        paymentMethod: input.paymentMethod,
        total: total.toFixed(2),
      });
      await tx.insert(orderItems).values(itemRows);
    });

    return { id: orderId, status: "pending" as const, total: total.toFixed(2) };
  }),

  /**
   * Only the order's owner (matching userId) or staff of the exact same
   * store can read it — staff of any other store gets NOT_FOUND, identical
   * to a nonexistent order, via resolveStoreId.
   */
  getById: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db.select().from(orders).where(eq(orders.id, input.orderId));
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }

      const isOwner = order.userId !== null && order.userId === ctx.user.userId;
      if (!isOwner) {
        await resolveStoreId(ctx.db, ctx.user, order.storeId);
      }

      const items = await ctx.db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      return { ...order, items };
    }),
});
