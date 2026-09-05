import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import {
  categories,
  customers,
  orders,
  products,
  storeManagers,
  stores,
  users,
  type OrderStatus,
} from "../src/db/schema.js";
import { slugify } from "../src/util/slug.js";
import { appRouter } from "../src/trpc/routers/_app.js";
import { createTestContext } from "../src/trpc/context.js";
import type { AuthTokenPayload } from "../src/auth/jwt.js";
import { hashPassword } from "../src/auth/password.js";
import { clearStorefrontCache } from "../src/storefront/resolveStore.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/konvert_test";

const pool = mysql.createPool({ uri: TEST_DATABASE_URL, ssl: undefined });
export const testDb = drizzle(pool, { schema, mode: "default" });

export async function resetDb(): Promise<void> {
  await testDb.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0"));
  await testDb.execute(sql.raw("TRUNCATE TABLE journey_executions"));
  await testDb.execute(sql.raw("TRUNCATE TABLE journeys"));
  await testDb.execute(sql.raw("TRUNCATE TABLE scheduled_notifications"));
  await testDb.execute(sql.raw("TRUNCATE TABLE customer_tags"));
  await testDb.execute(sql.raw("TRUNCATE TABLE custom_tags"));
  await testDb.execute(sql.raw("TRUNCATE TABLE order_items"));
  await testDb.execute(sql.raw("TRUNCATE TABLE orders"));
  await testDb.execute(sql.raw("TRUNCATE TABLE customers"));
  await testDb.execute(sql.raw("TRUNCATE TABLE products"));
  await testDb.execute(sql.raw("TRUNCATE TABLE categories"));
  await testDb.execute(sql.raw("TRUNCATE TABLE store_settings"));
  await testDb.execute(sql.raw("TRUNCATE TABLE store_managers"));
  await testDb.execute(sql.raw("TRUNCATE TABLE stores"));
  await testDb.execute(sql.raw("TRUNCATE TABLE users"));
  await testDb.execute(sql.raw("TRUNCATE TABLE accounts"));
  await testDb.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 1"));
  clearStorefrontCache();
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

export function caller(user: AuthTokenPayload | null, host: string | null = null) {
  return appRouter.createCaller(createTestContext(user, testDb, host));
}

export async function createAccountWithStore(label: string) {
  const anon = caller(null);
  const signup = await anon.auth.signup({
    accountName: `Conta ${label}`,
    storeName: `Loja ${label}`,
    adminName: `Admin ${label}`,
    email: `admin-${label}-${randomUUID()}@example.com`,
    password: "supersecret123",
  });
  const adminUser: AuthTokenPayload = {
    userId: signup.user.id,
    email: signup.user.email,
    role: "admin",
    accountId: signup.account.id,
  };
  return { ...signup, adminUser };
}

export async function createManager(accountId: string, storeId: string) {
  const userId = randomUUID();
  await testDb.insert(users).values({
    id: userId,
    accountId,
    email: `manager-${randomUUID()}@example.com`,
    passwordHash: await hashPassword("supersecret123"),
    name: "Manager",
    role: "manager",
  });
  await testDb.insert(storeManagers).values({ id: randomUUID(), userId, storeId });
  const managerUser: AuthTokenPayload = { userId, email: "manager", role: "manager", accountId };
  return managerUser;
}

/** Gives an existing account a second store, to exercise the "multiple stores, none selected" case. */
export async function addStoreToAccount(accountId: string, label: string) {
  const storeId = randomUUID();
  const publicSlug = `${slugify(`loja-${label}`)}-${randomUUID().slice(0, 8)}`;
  await testDb.insert(stores).values({
    id: storeId,
    accountId,
    name: `Loja extra ${label}`,
    slug: `loja-extra-${label}`,
    publicSlug,
  });
  return { id: storeId, publicSlug };
}

/** A global customer identity, reusable across any number of stores' orders. */
export async function createCustomer(opts?: { phone?: string; name?: string }) {
  const id = randomUUID();
  const phone = opts?.phone ?? `+5511${randomUUID().replace(/\D/g, "").slice(0, 9)}`;
  await testDb.insert(customers).values({ id, phone, name: opts?.name ?? "Cliente Teste" });
  return { id, phone };
}

/** Seeds a minimal order for a customer directly (bypasses checkout, which doesn't collect a phone yet). */
export async function seedOrderForCustomer(
  storeId: string,
  customerId: string,
  opts?: { total?: string; status?: OrderStatus; createdAt?: Date },
) {
  const id = randomUUID();
  await testDb.insert(orders).values({
    id,
    storeId,
    customerId,
    status: opts?.status ?? "delivered",
    deliveryAddress: "Rua de Teste, 1",
    total: opts?.total ?? "50.00",
    createdAt: opts?.createdAt,
  });
  return { id };
}

export async function seedMenu(storeId: string, opts?: { price?: string; active?: boolean }) {
  const categoryId = randomUUID();
  const productId = randomUUID();
  await testDb.insert(categories).values({
    id: categoryId,
    storeId,
    name: "Pizzas",
    slug: "pizzas",
  });
  await testDb.insert(products).values({
    id: productId,
    storeId,
    categoryId,
    name: "Marguerita",
    price: opts?.price ?? "39.90",
    active: opts?.active ?? true,
  });
  return { categoryId, productId };
}
