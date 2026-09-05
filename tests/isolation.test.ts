import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resolveStoreId } from "../src/auth/access.js";
import { stores } from "../src/db/schema.js";
import {
  caller,
  closeDb,
  createAccountWithStore,
  createManager,
  resetDb,
  testDb,
} from "./helpers.js";
import type { AuthTokenPayload } from "../src/auth/jwt.js";

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("cross-account isolation", () => {
  it("resolveStoreId lets an admin resolve only their own account's store", async () => {
    const accountA = await createAccountWithStore("A");
    const accountB = await createAccountWithStore("B");

    await expect(
      resolveStoreId(testDb, accountA.adminUser, accountA.store.id),
    ).resolves.toBe(accountA.store.id);

    await expect(
      resolveStoreId(testDb, accountA.adminUser, accountB.store.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("admin with a single store can omit storeId and still gets only their own", async () => {
    const accountA = await createAccountWithStore("A");
    const resolved = await resolveStoreId(testDb, accountA.adminUser);
    expect(resolved).toBe(accountA.store.id);
  });

  it("stores.list never returns another account's stores", async () => {
    const accountA = await createAccountWithStore("A");
    const accountB = await createAccountWithStore("B");

    const listA = await caller(accountA.adminUser).stores.list();
    expect(listA.map((s) => s.id)).toEqual([accountA.store.id]);
    expect(listA.map((s) => s.id)).not.toContain(accountB.store.id);

    const listB = await caller(accountB.adminUser).stores.list();
    expect(listB.map((s) => s.id)).toEqual([accountB.store.id]);
  });

  it("stores.getById refuses to fetch another account's store", async () => {
    const accountA = await createAccountWithStore("A");
    const accountB = await createAccountWithStore("B");

    await expect(
      caller(accountA.adminUser).stores.getById({ storeId: accountB.store.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const own = await caller(accountA.adminUser).stores.getById({ storeId: accountA.store.id });
    expect(own?.id).toBe(accountA.store.id);
  });

  it("a manager can only access the store they are explicitly linked to", async () => {
    const accountA = await createAccountWithStore("A");
    const accountB = await createAccountWithStore("B");
    const managerA = await createManager(accountA.account.id, accountA.store.id);

    await expect(resolveStoreId(testDb, managerA, accountA.store.id)).resolves.toBe(
      accountA.store.id,
    );
    await expect(resolveStoreId(testDb, managerA)).resolves.toBe(accountA.store.id);

    // Manager from account A has no link to account B's store, even though
    // both accounts exist in the same database.
    await expect(resolveStoreId(testDb, managerA, accountB.store.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const list = await caller(managerA).stores.list();
    expect(list.map((s) => s.id)).toEqual([accountA.store.id]);
  });

  it("platform_admin can resolve any store but must specify one explicitly", async () => {
    const accountA = await createAccountWithStore("A");
    const platformAdmin: AuthTokenPayload = {
      userId: randomUUID(),
      email: "root@konvert.dev",
      role: "platform_admin",
      accountId: null,
    };

    await expect(resolveStoreId(testDb, platformAdmin)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      resolveStoreId(testDb, platformAdmin, accountA.store.id),
    ).resolves.toBe(accountA.store.id);
  });

  it("enforces store slug uniqueness per account, not globally", async () => {
    const accountA = await createAccountWithStore("A");
    const accountB = await createAccountWithStore("B");

    // Same slug is fine across two different accounts (composite unique).
    await expect(
      testDb.insert(stores).values({
        id: randomUUID(),
        accountId: accountB.account.id,
        name: "Filial",
        slug: "filial",
        publicSlug: `filial-${randomUUID()}`,
      }),
    ).resolves.toBeDefined();
    await expect(
      testDb.insert(stores).values({
        id: randomUUID(),
        accountId: accountA.account.id,
        name: "Filial",
        slug: "filial",
        publicSlug: `filial-${randomUUID()}`,
      }),
    ).resolves.toBeDefined();

    // But the same account can't reuse a slug for a second store.
    await expect(
      testDb.insert(stores).values({
        id: randomUUID(),
        accountId: accountA.account.id,
        name: "Filial Duplicada",
        slug: "filial",
        publicSlug: `filial-${randomUUID()}`,
      }),
    ).rejects.toThrow();
  });
});
