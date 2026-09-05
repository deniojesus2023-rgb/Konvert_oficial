import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, sum } from "drizzle-orm";
import { z } from "zod";
import { assertOwnedByStore, resolveStoreId } from "../../auth/access.js";
import {
  journeyExecutions,
  journeyStatusEnum,
  journeyTriggerEnum,
  journeys,
  orders,
} from "../../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

const journeyStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("send_whatsapp"), message: z.string().min(1).max(1000) }),
  z.object({ type: z.literal("wait"), hours: z.number().positive() }),
  z.object({ type: z.literal("apply_tag"), tag: z.string().min(1).max(64) }),
]);

export const automationsRouter = router({
  listJourneys: protectedProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input?.storeId);
      return ctx.db.select().from(journeys).where(eq(journeys.storeId, storeId));
    }),

  createJourney: protectedProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        name: z.string().min(1).max(191),
        trigger: z.enum(journeyTriggerEnum),
        steps: z.array(journeyStepSchema).min(1),
        status: z.enum(journeyStatusEnum).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      const id = randomUUID();
      await ctx.db.insert(journeys).values({
        id,
        storeId,
        name: input.name,
        trigger: input.trigger,
        steps: input.steps,
        status: input.status ?? "active",
      });
      const [created] = await ctx.db.select().from(journeys).where(eq(journeys.id, id));
      return created;
    }),

  updateJourney: protectedProcedure
    .input(
      z.object({
        journeyId: z.string(),
        storeId: z.string().optional(),
        name: z.string().min(1).max(191).optional(),
        trigger: z.enum(journeyTriggerEnum).optional(),
        steps: z.array(journeyStepSchema).min(1).optional(),
        status: z.enum(journeyStatusEnum).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      const [journey] = await ctx.db.select().from(journeys).where(eq(journeys.id, input.journeyId));
      assertOwnedByStore(journey, storeId, "Journey not found");

      const patch: Partial<typeof journeys.$inferInsert> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.trigger !== undefined) patch.trigger = input.trigger;
      if (input.steps !== undefined) patch.steps = input.steps;
      if (input.status !== undefined) patch.status = input.status;

      if (Object.keys(patch).length > 0) {
        await ctx.db.update(journeys).set(patch).where(eq(journeys.id, input.journeyId));
      }
      const [updated] = await ctx.db.select().from(journeys).where(eq(journeys.id, input.journeyId));
      return updated;
    }),

  toggleJourney: protectedProcedure
    .input(z.object({ journeyId: z.string(), storeId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      const [journey] = await ctx.db.select().from(journeys).where(eq(journeys.id, input.journeyId));
      const owned = assertOwnedByStore(journey, storeId, "Journey not found");

      const nextStatus = owned.status === "active" ? "inactive" : "active";
      await ctx.db.update(journeys).set({ status: nextStatus }).where(eq(journeys.id, input.journeyId));
      return { id: input.journeyId, status: nextStatus };
    }),

  /** Executions for the resolved store only — a journeyId filter never escapes that scope. */
  listExecutions: protectedProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        journeyId: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 20;

      const where = input.journeyId
        ? and(eq(journeyExecutions.storeId, storeId), eq(journeyExecutions.journeyId, input.journeyId))
        : eq(journeyExecutions.storeId, storeId);

      const [items, totalRows] = await Promise.all([
        ctx.db.select().from(journeyExecutions).where(where).limit(pageSize).offset((page - 1) * pageSize),
        ctx.db.select({ total: count() }).from(journeyExecutions).where(where),
      ]);

      return { items, page, pageSize, total: totalRows[0]?.total ?? 0 };
    }),

  /**
   * Every number here is computed from the resolved store's own rows
   * only — executions, completions, and the revenue sum all filter by
   * this storeId, never aggregated with any other store's data even
   * when the same customer shows up in both.
   */
  getGlobalMetrics: protectedProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input?.storeId);

      const [totalRows, completedRows] = await Promise.all([
        ctx.db.select({ total: count() }).from(journeyExecutions).where(eq(journeyExecutions.storeId, storeId)),
        ctx.db
          .select({ total: count() })
          .from(journeyExecutions)
          .where(and(eq(journeyExecutions.storeId, storeId), eq(journeyExecutions.status, "completed"))),
      ]);
      const totalExecutions = totalRows[0]?.total ?? 0;
      const completedExecutions = completedRows[0]?.total ?? 0;

      const completedCustomers = await ctx.db
        .selectDistinct({ customerId: journeyExecutions.customerId })
        .from(journeyExecutions)
        .where(and(eq(journeyExecutions.storeId, storeId), eq(journeyExecutions.status, "completed")));

      const customerIds = completedCustomers.map((row) => row.customerId);
      let revenueAttributed = "0.00";
      if (customerIds.length > 0) {
        const [row] = await ctx.db
          .select({ total: sum(orders.total) })
          .from(orders)
          .where(and(eq(orders.storeId, storeId), inArray(orders.customerId, customerIds)));
        revenueAttributed = row?.total ?? "0.00";
      }

      return {
        totalExecutions,
        completedExecutions,
        conversionRate: totalExecutions === 0 ? 0 : completedExecutions / totalExecutions,
        revenueAttributed,
      };
    }),
});
