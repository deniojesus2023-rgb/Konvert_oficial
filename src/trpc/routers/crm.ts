import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { resolveStoreId } from "../../auth/access.js";
import { customerTags, customers, orders } from "../../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

export const crmRouter = router({
  /**
   * The customer identity itself is global (same phone can order from
   * many stores), but everything shown alongside it here — tags and
   * order history — is filtered to the resolved store only. A staff
   * member never sees this customer's behavior in any other store, even
   * though the underlying `customers` row is the same one everywhere.
   */
  getCustomerDetail: protectedProcedure
    .input(z.object({ customerId: z.string(), storeId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);

      const [customer] = await ctx.db.select().from(customers).where(eq(customers.id, input.customerId));
      if (!customer) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      }

      const [tags, customerOrders] = await Promise.all([
        ctx.db
          .select({ tag: customerTags.tag })
          .from(customerTags)
          .where(and(eq(customerTags.storeId, storeId), eq(customerTags.customerId, input.customerId))),
        ctx.db
          .select()
          .from(orders)
          .where(and(eq(orders.storeId, storeId), eq(orders.customerId, input.customerId)))
          .orderBy(desc(orders.createdAt)),
      ]);

      return {
        customer,
        tags: tags.map((row) => row.tag),
        orders: customerOrders,
      };
    }),
});
