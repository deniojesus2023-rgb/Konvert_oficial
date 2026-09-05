import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import { appRouter } from "../src/trpc/routers/_app.js";
import { createTestContext } from "../src/trpc/context.js";
import type { AuthTokenPayload } from "../src/auth/jwt.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/konvert_test";

const pool = mysql.createPool({ uri: TEST_DATABASE_URL, ssl: undefined });
export const testDb = drizzle(pool, { schema, mode: "default" });

export async function resetDb(): Promise<void> {
  await testDb.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0"));
  await testDb.execute(sql.raw("TRUNCATE TABLE store_managers"));
  await testDb.execute(sql.raw("TRUNCATE TABLE stores"));
  await testDb.execute(sql.raw("TRUNCATE TABLE users"));
  await testDb.execute(sql.raw("TRUNCATE TABLE accounts"));
  await testDb.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 1"));
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

export function caller(user: AuthTokenPayload | null) {
  return appRouter.createCaller(createTestContext(user, testDb));
}
