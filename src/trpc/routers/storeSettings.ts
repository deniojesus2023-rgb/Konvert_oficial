import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { resolveStoreId } from "../../auth/access.js";
import { resolveStorefrontStore } from "../../storefront/resolveStore.js";
import { storeSettings } from "../../db/schema.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

/**
 * Whitelist, not blacklist: only keys explicitly listed here ever reach
 * the public storefront. A new setting (however sensitive) defaults to
 * admin-only until someone deliberately adds it here — the opposite of a
 * blacklist, where a forgotten entry silently leaks.
 */
const PUBLIC_SETTING_KEYS = ["whatsapp", "openingHours"] as const;

function toMap(rows: { key: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export const storeSettingsRouter = router({
  /**
   * Staff-only. Returns every setting for the resolved store, sensitive
   * fields (PIX key, etc.) included. Deliberately a different endpoint
   * from getPublic, not the same one gated by an `isAdmin` flag — a bug
   * in a flag check is a data leak, a bug in "which endpoint gets called"
   * is not.
   */
  getAdmin: protectedProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input?.storeId);
      const rows = await ctx.db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      return toMap(rows);
    }),

  /** Public storefront view: only the whitelisted, non-sensitive keys. */
  getPublic: publicProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const store = await resolveStorefrontStore(ctx.db, {
        storeId: input?.storeId,
        host: ctx.host,
      });
      if (!store) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      }
      const rows = await ctx.db
        .select()
        .from(storeSettings)
        .where(
          and(eq(storeSettings.storeId, store.id), inArray(storeSettings.key, [...PUBLIC_SETTING_KEYS])),
        );
      return toMap(rows);
    }),

  set: protectedProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        key: z.string().min(1).max(191),
        value: z.string().max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storeId = await resolveStoreId(ctx.db, ctx.user, input.storeId);

      await ctx.db
        .insert(storeSettings)
        .values({ id: randomUUID(), storeId, key: input.key, value: input.value })
        .onDuplicateKeyUpdate({ set: { value: input.value } });

      const [row] = await ctx.db
        .select()
        .from(storeSettings)
        .where(and(eq(storeSettings.storeId, storeId), eq(storeSettings.key, input.key)));
      return row;
    }),
});
