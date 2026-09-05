import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addStoreToAccount,
  caller,
  closeDb,
  createAccountWithStore,
  createManager,
  resetDb,
  seedMenu,
} from "./helpers.js";

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("assertOwnedByStore guards on action-by-id mutations", () => {
  it("a manager of store A cannot update a product from store B by passing its id directly", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const managerA = await createManager(storeA.account.id, storeA.store.id);
    const { productId: productB } = await seedMenu(storeB.store.id);

    await expect(
      caller(managerA).products.update({ productId: productB, name: "Hackeado" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      caller(managerA).products.delete({ productId: productB }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("an admin of store A cannot update a category from store B by passing its id directly", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const { categoryId: categoryB } = await seedMenu(storeB.store.id);

    await expect(
      caller(storeA.adminUser).categories.update({
        categoryId: categoryB,
        storeId: storeA.store.id,
        name: "Roubado",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("staff of store A cannot update the status of an order from store B", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const { productId } = await seedMenu(storeB.store.id);

    const order = await caller(null).orders.create({
      storeId: storeB.store.id,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: "Rua B, 1",
      paymentMethod: "cash_on_delivery",
    });

    await expect(
      caller(storeA.adminUser).orders.updateStatus({ orderId: order.id, status: "confirmed" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a manager cannot act on another store even by passing that storeId explicitly in the input", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const managerA = await createManager(storeA.account.id, storeA.store.id);

    // manager tries to sneak storeB's id into the input; resolveStoreId must ignore it.
    await expect(
      caller(managerA).products.create({
        storeId: storeB.store.id,
        categoryId: "does-not-matter",
        name: "Produto Espião",
        price: 10,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("orders.listAll requires a resolvable store", () => {
  it("an admin with more than one store and no storeId picked gets a clear error, not an empty list", async () => {
    const storeA = await createAccountWithStore("A");
    await addStoreToAccount(storeA.account.id, "segunda");

    await expect(caller(storeA.adminUser).orders.listAll({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("scopes listAll strictly to the resolved store, with pagination and status filter", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const { productId: productA } = await seedMenu(storeA.store.id);
    const { productId: productB } = await seedMenu(storeB.store.id);

    const anon = caller(null);
    await anon.orders.create({
      storeId: storeA.store.id,
      items: [{ productId: productA, quantity: 1 }],
      deliveryAddress: "Rua A, 1",
      paymentMethod: "cash_on_delivery",
    });
    await anon.orders.create({
      storeId: storeB.store.id,
      items: [{ productId: productB, quantity: 1 }],
      deliveryAddress: "Rua B, 1",
      paymentMethod: "cash_on_delivery",
    });

    const result = await caller(storeA.adminUser).orders.listAll({ storeId: storeA.store.id });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.storeId).toBe(storeA.store.id);
    expect(result.total).toBe(1);

    const filtered = await caller(storeA.adminUser).orders.listAll({
      storeId: storeA.store.id,
      status: "confirmed",
    });
    expect(filtered.items).toHaveLength(0);
  });
});

describe("orders.updateStatus transition rules", () => {
  it("rejects skipping straight from pending to delivered", async () => {
    const storeA = await createAccountWithStore("A");
    const { productId } = await seedMenu(storeA.store.id);
    const order = await caller(null).orders.create({
      storeId: storeA.store.id,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: "Rua A, 1",
      paymentMethod: "cash_on_delivery",
    });

    await expect(
      caller(storeA.adminUser).orders.updateStatus({ orderId: order.id, status: "delivered" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows the full valid sequence, and rejects reviving a delivered order", async () => {
    const storeA = await createAccountWithStore("A");
    const { productId } = await seedMenu(storeA.store.id);
    const order = await caller(null).orders.create({
      storeId: storeA.store.id,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: "Rua A, 1",
      paymentMethod: "cash_on_delivery",
    });

    const admin = caller(storeA.adminUser);
    for (const status of ["confirmed", "preparing", "out_for_delivery", "delivered"] as const) {
      const updated = await admin.orders.updateStatus({ orderId: order.id, status });
      expect(updated!.status).toBe(status);
    }

    await expect(
      admin.orders.updateStatus({ orderId: order.id, status: "confirmed" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows canceling from any state before delivered", async () => {
    const storeA = await createAccountWithStore("A");
    const { productId } = await seedMenu(storeA.store.id);
    const order = await caller(null).orders.create({
      storeId: storeA.store.id,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: "Rua A, 1",
      paymentMethod: "cash_on_delivery",
    });

    const admin = caller(storeA.adminUser);
    const canceled = await admin.orders.updateStatus({ orderId: order.id, status: "canceled" });
    expect(canceled!.status).toBe("canceled");

    await expect(
      admin.orders.updateStatus({ orderId: order.id, status: "confirmed" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("storeSettings admin vs public split", () => {
  it("getAdmin returns sensitive fields; the public endpoint never does", async () => {
    const storeA = await createAccountWithStore("A");
    const admin = caller(storeA.adminUser);

    await admin.storeSettings.set({ key: "pixKey", value: "chave-pix-secreta" });
    await admin.storeSettings.set({ key: "whatsapp", value: "+55 11 99999-0000" });
    await admin.storeSettings.set({ key: "openingHours", value: "18h-23h" });

    const adminView = await admin.storeSettings.getAdmin({ storeId: storeA.store.id });
    expect(adminView.pixKey).toBe("chave-pix-secreta");
    expect(adminView.whatsapp).toBe("+55 11 99999-0000");

    const publicView = await caller(null).storeSettings.getPublic({ storeId: storeA.store.id });
    expect(publicView.whatsapp).toBe("+55 11 99999-0000");
    expect(publicView.openingHours).toBe("18h-23h");
    expect(publicView.pixKey).toBeUndefined();
  });

  it("a manager cannot read or write settings for a store they don't manage", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const managerA = await createManager(storeA.account.id, storeA.store.id);

    await expect(
      caller(managerA).storeSettings.set({
        storeId: storeB.store.id,
        key: "pixKey",
        value: "roubado",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      caller(managerA).storeSettings.getAdmin({ storeId: storeB.store.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
