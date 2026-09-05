import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  caller,
  closeDb,
  createAccountWithStore,
  createCustomer,
  createManager,
  createPlatformAdmin,
  resetDb,
  seedMenu,
  seedOrderForCustomer,
  testDb,
} from "./helpers.js";
import { platformAuditLog } from "../src/db/schema.js";

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("platform.* is restricted to platform_admin", () => {
  it("an ordinary admin, even the owner of a large account, gets FORBIDDEN on every platform.* endpoint", async () => {
    const storeA = await createAccountWithStore("A");
    const admin = caller(storeA.adminUser);

    await expect(admin.platform.listAccounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      admin.platform.getAccountDetail({ accountId: storeA.account.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      admin.platform.suspendAccount({ accountId: storeA.account.id, reason: "test" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      admin.platform.changeAccountPlan({ accountId: storeA.account.id, newPlan: "pro" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.platform.getGlobalMetrics()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      admin.platform.impersonateAccount({ accountId: storeA.account.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a manager also gets FORBIDDEN, while platform_admin itself is allowed through", async () => {
    const storeA = await createAccountWithStore("A");
    const managerA = await createManager(storeA.account.id, storeA.store.id);
    const platformAdmin = await createPlatformAdmin();

    await expect(caller(managerA).platform.listAccounts()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller(platformAdmin).platform.listAccounts()).resolves.toBeDefined();
  });
});

describe("suspendAccount writes a correct audit log entry", () => {
  it("records the acting platform_admin's userId and the target account", async () => {
    const storeA = await createAccountWithStore("A");
    const platformAdmin = await createPlatformAdmin();

    await caller(platformAdmin).platform.suspendAccount({
      accountId: storeA.account.id,
      reason: "Pagamento em atraso",
    });

    const rows = await testDb
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.targetAccountId, storeA.account.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("suspend_account");
    expect(rows[0]!.platformAdminUserId).toBe(platformAdmin.userId);
    expect((rows[0]!.metadata as { reason?: string })?.reason).toBe("Pagamento em atraso");
  });

  it("reactivateAccount and changeAccountPlan also leave their own audit trail", async () => {
    const storeA = await createAccountWithStore("A");
    const platformAdmin = await createPlatformAdmin();
    const platform = caller(platformAdmin).platform;

    await platform.suspendAccount({ accountId: storeA.account.id, reason: "x" });
    await platform.reactivateAccount({ accountId: storeA.account.id, reason: "pagou" });
    await platform.changeAccountPlan({ accountId: storeA.account.id, newPlan: "enterprise" });

    const rows = await testDb
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.targetAccountId, storeA.account.id));

    const actions = rows.map((r) => r.action).sort();
    expect(actions).toEqual(["change_plan", "reactivate_account", "suspend_account"]);
    expect(rows.every((r) => r.platformAdminUserId === platformAdmin.userId)).toBe(true);
  });
});

describe("login rejects suspended accounts with a clear message", () => {
  it("gives a distinct, explanatory error instead of the generic invalid-credentials message", async () => {
    const storeA = await createAccountWithStore("A");
    const platformAdmin = await createPlatformAdmin();

    await caller(platformAdmin).platform.suspendAccount({
      accountId: storeA.account.id,
      reason: "fraude suspeita",
    });

    const anon = caller(null);
    await expect(
      anon.auth.login({ email: storeA.user.email, password: "supersecret123" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("suspensa"),
    });
  });

  it("a normal, active account still logs in fine", async () => {
    const storeA = await createAccountWithStore("A");
    const anon = caller(null);
    await expect(
      anon.auth.login({ email: storeA.user.email, password: "supersecret123" }),
    ).resolves.toBeDefined();
  });
});

describe("getGlobalMetrics is the only endpoint that aggregates across accounts", () => {
  it("aggregates orders from two unrelated accounts, unlike any staff endpoint", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const platformAdmin = await createPlatformAdmin();

    const { productId: productA } = await seedMenu(storeA.store.id, { price: "100.00" });
    const { productId: productB } = await seedMenu(storeB.store.id, { price: "200.00" });
    const customerA = await createCustomer();
    const customerB = await createCustomer();
    await seedOrderForCustomer(storeA.store.id, customerA.id, { total: "100.00" });
    await seedOrderForCustomer(storeB.store.id, customerB.id, { total: "200.00" });
    void productA;
    void productB;

    const globalMetrics = await caller(platformAdmin).platform.getGlobalMetrics();
    expect(globalMetrics.activeAccounts).toBeGreaterThanOrEqual(2);
    expect(Number(globalMetrics.totalRevenue)).toBeGreaterThanOrEqual(300);

    // Every regular staff endpoint stays scoped to the caller's own account/store,
    // even when asked to aggregate ("global metrics") within that scope.
    const metricsA = await caller(storeA.adminUser).automations.getGlobalMetrics();
    const ordersA = await caller(storeA.adminUser).orders.listAll({ storeId: storeA.store.id });

    expect(ordersA.items.every((order) => order.storeId === storeA.store.id)).toBe(true);
    // storeA's own automation metrics can't have been inflated by storeB's revenue.
    expect(Number(metricsA.revenueAttributed)).toBe(0);

    // stores.listMine for A's admin never includes B's store.
    const myStores = await caller(storeA.adminUser).stores.listMine();
    expect(myStores.map((s) => s.id)).not.toContain(storeB.store.id);
  });

  it("getAccountDetail aggregates only within the one requested account, never across accounts", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const platformAdmin = await createPlatformAdmin();
    const customerA = await createCustomer();
    const customerB = await createCustomer();
    await seedOrderForCustomer(storeA.store.id, customerA.id, { total: "50.00" });
    await seedOrderForCustomer(storeB.store.id, customerB.id, { total: "9999.00" });

    const detail = await caller(platformAdmin).platform.getAccountDetail({
      accountId: storeA.account.id,
    });

    expect(detail.stores.map((s) => s.id)).toEqual([storeA.store.id]);
    expect(Number(detail.metrics.revenue)).toBe(50);
  });
});

describe("platform.impersonateAccount", () => {
  it("mints a short-lived admin token for the target account and logs start and end", async () => {
    const storeA = await createAccountWithStore("A");
    const platformAdmin = await createPlatformAdmin();
    const platform = caller(platformAdmin).platform;

    const result = await platform.impersonateAccount({ accountId: storeA.account.id });
    expect(result.token).toBeTruthy();
    expect(result.expiresInMinutes).toBe(15);

    await platform.endImpersonation({ accountId: storeA.account.id });

    const rows = await testDb
      .select()
      .from(platformAuditLog)
      .where(eq(platformAuditLog.targetAccountId, storeA.account.id));
    const actions = rows.map((r) => r.action).sort();
    expect(actions).toEqual(["impersonate_end", "impersonate_start"]);
  });
});
