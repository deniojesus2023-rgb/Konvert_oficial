import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray, like, ne, or, sum } from "drizzle-orm";
import { z } from "zod";
import { accountPlanEnum, accountStatusEnum, accounts, orders, stores, users } from "../../db/schema.js";
import type { Database } from "../../db/client.js";
import { signAuthToken } from "../../auth/jwt.js";
import { writeAuditLog } from "../../platform/audit.js";
import { platformProcedure, router } from "../trpc.js";

async function requireAccount(db: Database, accountId: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  }
  return account;
}

export const platformRouter = router({
  listAccounts: platformProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          plan: z.enum(accountPlanEnum).optional(),
          status: z.enum(accountStatusEnum).optional(),
          page: z.number().int().positive().optional(),
          pageSize: z.number().int().positive().max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;

      const filters = [];
      if (input?.plan) filters.push(eq(accounts.plan, input.plan));
      if (input?.status) filters.push(eq(accounts.status, input.status));

      if (input?.search) {
        const term = `%${input.search}%`;
        const ownerMatches = await ctx.db
          .select({ accountId: users.accountId })
          .from(users)
          .where(and(eq(users.role, "admin"), like(users.email, term)));
        const ownerAccountIds = ownerMatches
          .map((row) => row.accountId)
          .filter((id): id is string => id !== null);

        filters.push(
          ownerAccountIds.length > 0
            ? or(like(accounts.name, term), inArray(accounts.id, ownerAccountIds))!
            : like(accounts.name, term),
        );
      }

      const where = filters.length > 0 ? and(...filters) : undefined;

      const [items, totalRows] = await Promise.all([
        ctx.db.select().from(accounts).where(where).limit(pageSize).offset((page - 1) * pageSize),
        ctx.db.select({ total: count() }).from(accounts).where(where),
      ]);

      return { items, page, pageSize, total: totalRows[0]?.total ?? 0 };
    }),

  /**
   * Aggregating this account's orders across ALL of its stores is
   * correct here — unlike everywhere else in the system, this is one
   * account owner's consolidated view of their own stores, not a
   * cross-tenant comparison between different customers.
   */
  getAccountDetail: platformProcedure
    .input(z.object({ accountId: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await requireAccount(ctx.db, input.accountId);
      const accountStores = await ctx.db.select().from(stores).where(eq(stores.accountId, input.accountId));
      const storeIds = accountStores.map((s) => s.id);

      let orderCount = 0;
      let revenue = "0.00";
      if (storeIds.length > 0) {
        const [row] = await ctx.db
          .select({ count: count(), revenue: sum(orders.total) })
          .from(orders)
          .where(and(inArray(orders.storeId, storeIds), ne(orders.status, "canceled")));
        orderCount = row?.count ?? 0;
        revenue = row?.revenue ?? "0.00";
      }

      return { account, stores: accountStores, metrics: { orderCount, revenue } };
    }),

  suspendAccount: platformProcedure
    .input(z.object({ accountId: z.string(), reason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await requireAccount(ctx.db, input.accountId);
      await ctx.db.update(accounts).set({ status: "suspended" }).where(eq(accounts.id, input.accountId));
      await writeAuditLog(ctx.db, {
        platformAdminUserId: ctx.user.userId,
        action: "suspend_account",
        targetAccountId: input.accountId,
        metadata: { reason: input.reason },
      });
      return requireAccount(ctx.db, input.accountId);
    }),

  reactivateAccount: platformProcedure
    .input(z.object({ accountId: z.string(), reason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await requireAccount(ctx.db, input.accountId);
      await ctx.db.update(accounts).set({ status: "active" }).where(eq(accounts.id, input.accountId));
      await writeAuditLog(ctx.db, {
        platformAdminUserId: ctx.user.userId,
        action: "reactivate_account",
        targetAccountId: input.accountId,
        metadata: { reason: input.reason },
      });
      return requireAccount(ctx.db, input.accountId);
    }),

  changeAccountPlan: platformProcedure
    .input(z.object({ accountId: z.string(), newPlan: z.enum(accountPlanEnum) }))
    .mutation(async ({ ctx, input }) => {
      const account = await requireAccount(ctx.db, input.accountId);
      await ctx.db.update(accounts).set({ plan: input.newPlan }).where(eq(accounts.id, input.accountId));
      await writeAuditLog(ctx.db, {
        platformAdminUserId: ctx.user.userId,
        action: "change_plan",
        targetAccountId: input.accountId,
        metadata: { oldPlan: account.plan, newPlan: input.newPlan },
      });
      return requireAccount(ctx.db, input.accountId);
    }),

  /**
   * The one deliberate exception to this codebase's isolation rule:
   * platform-wide totals across every account and store on the system.
   * No other endpoint in the app is allowed to aggregate across
   * different accounts — this dashboard exists specifically because
   * platform_admin's job requires that global view.
   */
  getGlobalMetrics: platformProcedure.query(async ({ ctx }) => {
    const [activeAccountsRows, totalStoresRows, revenueRows] = await Promise.all([
      ctx.db.select({ total: count() }).from(accounts).where(eq(accounts.status, "active")),
      ctx.db.select({ total: count() }).from(stores),
      ctx.db.select({ total: sum(orders.total) }).from(orders).where(ne(orders.status, "canceled")),
    ]);

    return {
      activeAccounts: activeAccountsRows[0]?.total ?? 0,
      totalStores: totalStoresRows[0]?.total ?? 0,
      totalRevenue: revenueRows[0]?.total ?? "0.00",
    };
  }),

  /**
   * Support impersonation: mints a short-lived (15 min) token acting as
   * that account's admin. Both the start AND the end are mandatory audit
   * entries — a platform_admin silently acting as any customer with no
   * trace would defeat the entire point of this log. The frontend must
   * keep the platform_admin's own token aside while impersonating (the
   * impersonation token itself can't call platform.* — it isn't
   * platform_admin) and call endImpersonation with that original token
   * when support mode ends.
   */
  impersonateAccount: platformProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAccount(ctx.db, input.accountId);
      const [targetAdmin] = await ctx.db
        .select()
        .from(users)
        .where(and(eq(users.accountId, input.accountId), eq(users.role, "admin")));

      if (!targetAdmin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This account has no admin user to impersonate" });
      }

      const token = signAuthToken(
        {
          userId: targetAdmin.id,
          email: targetAdmin.email,
          role: "admin",
          accountId: input.accountId,
          impersonatedBy: ctx.user.userId,
        },
        { expiresIn: "15m" },
      );

      await writeAuditLog(ctx.db, {
        platformAdminUserId: ctx.user.userId,
        action: "impersonate_start",
        targetAccountId: input.accountId,
        metadata: { impersonatedUserId: targetAdmin.id },
      });

      return { token, expiresInMinutes: 15 };
    }),

  endImpersonation: platformProcedure
    .input(z.object({ accountId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await writeAuditLog(ctx.db, {
        platformAdminUserId: ctx.user.userId,
        action: "impersonate_end",
        targetAccountId: input.accountId,
      });
      return { ok: true };
    }),
});
