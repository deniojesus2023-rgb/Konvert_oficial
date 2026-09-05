import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { products } from "../src/db/schema.js";
import {
  caller,
  closeDb,
  createAccountWithStore,
  createManager,
  resetDb,
  seedMenu,
  testDb,
} from "./helpers.js";

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("public menu isolation", () => {
  it("products.list of one store never returns another store's products", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const { productId: productA } = await seedMenu(storeA.store.id);
    const { productId: productB } = await seedMenu(storeB.store.id);

    const anon = caller(null);
    const listA = await anon.products.list({ storeId: storeA.store.id });
    expect(listA.map((p) => p.id)).toEqual([productA]);
    expect(listA.map((p) => p.id)).not.toContain(productB);

    const listB = await anon.products.list({ storeId: storeB.store.id });
    expect(listB.map((p) => p.id)).toEqual([productB]);
  });

  it("products.list only returns active products", async () => {
    const storeA = await createAccountWithStore("A");
    await seedMenu(storeA.store.id, { active: false });

    const anon = caller(null);
    const list = await anon.products.list({ storeId: storeA.store.id });
    expect(list).toEqual([]);
  });

  it("products.listAll (staff) sees inactive products, but only for their own store", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    await seedMenu(storeA.store.id, { active: false });
    await seedMenu(storeB.store.id);

    const listAllA = await caller(storeA.adminUser).products.listAll();
    expect(listAllA).toHaveLength(1);
    expect(listAllA[0]!.storeId).toBe(storeA.store.id);
  });

  it("categories.list requires a resolvable store and never leaks another store's categories", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const { categoryId: categoryA } = await seedMenu(storeA.store.id);
    await seedMenu(storeB.store.id);

    const anon = caller(null);
    const listA = await anon.categories.list({ storeId: storeA.store.id });
    expect(listA.map((c) => c.id)).toEqual([categoryA]);

    await expect(anon.categories.list()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stores.getBySlugOrHost resolves branding by explicit storeId and by publicSlug", async () => {
    const storeA = await createAccountWithStore("A");
    const anon = caller(null);

    const byId = await anon.stores.getBySlugOrHost({ storeId: storeA.store.id });
    expect(byId.id).toBe(storeA.store.id);

    const bySlug = await anon.stores.getBySlugOrHost({ slug: storeA.store.publicSlug });
    expect(bySlug.id).toBe(storeA.store.id);
  });

  it("resolves the store from a subdomain Host header, scoped per storefront request", async () => {
    const storeA = await createAccountWithStore("A");
    const anonOnHost = caller(null, `${storeA.store.publicSlug}.konvert.app`);
    const branding = await anonOnHost.stores.getBySlugOrHost();
    expect(branding.id).toBe(storeA.store.id);
  });
});

describe("orders.create cross-store cart rejection", () => {
  it("rejects an order whose items belong to a different store", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const { productId: productA } = await seedMenu(storeA.store.id);
    const { productId: productB } = await seedMenu(storeB.store.id);

    const anon = caller(null);
    await expect(
      anon.orders.create({
        storeId: storeA.store.id,
        items: [
          { productId: productA, quantity: 1 },
          { productId: productB, quantity: 1 }, // belongs to store B, not A
        ],
        deliveryAddress: "Rua Um, 123",
        paymentMethod: "cash_on_delivery",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts an order when every item belongs to the declared store", async () => {
    const storeA = await createAccountWithStore("A");
    const { productId } = await seedMenu(storeA.store.id, { price: "10.00" });

    const anon = caller(null);
    const order = await anon.orders.create({
      storeId: storeA.store.id,
      items: [{ productId, quantity: 3 }],
      deliveryAddress: "Rua Um, 123",
      paymentMethod: "cash_on_delivery",
    });

    expect(order.total).toBe("30.00");
  });
});

describe("orders.getById isolation", () => {
  it("staff of store A cannot fetch an order belonging to store B", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const { productId } = await seedMenu(storeB.store.id, { price: "15.00" });

    const anon = caller(null);
    const order = await anon.orders.create({
      storeId: storeB.store.id,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: "Rua da Loja B, 1",
      paymentMethod: "cash_on_delivery",
    });

    await expect(
      caller(storeA.adminUser).orders.getById({ orderId: order.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const ownStaffView = await caller(storeB.adminUser).orders.getById({ orderId: order.id });
    expect(ownStaffView.id).toBe(order.id);
  });

  it("a manager of store A cannot fetch an order from store B even when authenticated", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const managerA = await createManager(storeA.account.id, storeA.store.id);
    const { productId } = await seedMenu(storeB.store.id);

    const anon = caller(null);
    const order = await anon.orders.create({
      storeId: storeB.store.id,
      items: [{ productId, quantity: 1 }],
      deliveryAddress: "Rua da Loja B, 1",
      paymentMethod: "cash_on_delivery",
    });

    await expect(
      caller(managerA).orders.getById({ orderId: order.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("order_items price snapshot", () => {
  it("keeps the price charged at order time even after the product is repriced", async () => {
    const storeA = await createAccountWithStore("A");
    const { productId } = await seedMenu(storeA.store.id, { price: "20.00" });

    const anon = caller(null);
    const order = await anon.orders.create({
      storeId: storeA.store.id,
      items: [{ productId, quantity: 2 }],
      deliveryAddress: "Rua Um, 123",
      paymentMethod: "cash_on_delivery",
    });
    expect(order.total).toBe("40.00");

    // Product is repriced after the order was placed.
    await testDb.update(products).set({ price: "99.99" }).where(eq(products.id, productId));

    const fetched = await caller(storeA.adminUser).orders.getById({ orderId: order.id });
    expect(fetched.items).toHaveLength(1);
    expect(fetched.items[0]!.unitPrice).toBe("20.00");
    expect(fetched.total).toBe("40.00");
  });
});
