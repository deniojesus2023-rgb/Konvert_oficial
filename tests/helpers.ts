import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import { storeManagers, users } from "../src/db/schema.js";
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
  await testDb.execute(sql.raw("TRUNCATE TABLE order_items"));
  await testDb.execute(sql.raw("TRUNCATE TABLE orders"));
  await testDb.execute(sql.raw("TRUNCATE TABLE products"));
  await testDb.execute(sql.raw("TRUNCATE TABLE categories"));
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
