import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { resolveStoreId } from "../../auth/access.js";
import { notificationChannelEnum, scheduledNotifications } from "../../db/schema.js";
import { protectedProcedure, router } from "../trpc.js";

export const notificationsRouter = router({
  scheduleCreate: protectedProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        title: z.string().min(1).max(191),
        message: z.string().min(1).max(2000),
        channel: z.enum(notificationChannelEnum).optional(),
        targetAudience: z.string().min(1).max(64).optional(),
        scheduledAt: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);
      const id = randomUUID();
      await ctx.db.insert(scheduledNotifications).values({
        id,
        storeId,
        title: input.title,
        message: input.message,
        channel: input.channel ?? "whatsapp",
        targetAudience: input.targetAudience ?? "all",
        scheduledAt: input.scheduledAt,
      });
      const [created] = await ctx.db
        .select()
        .from(scheduledNotifications)
        .where(eq(scheduledNotifications.id, id));
      return created;
    }),

  list: protectedProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input?.storeId);
      return ctx.db
        .select()
        .from(scheduledNotifications)
        .where(eq(scheduledNotifications.storeId, storeId));
    }),
});
