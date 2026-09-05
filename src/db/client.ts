import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../env.js";
import * as schema from "./schema.js";

/**
 * TiDB Cloud Serverless / PlanetScale refuse plain connections, so TLS is
 * forced by default. Only local dev databases (DATABASE_SSL=false) skip it.
 */
const pool = mysql.createPool({
  uri: env.databaseUrl,
  ssl: env.databaseSsl ? {} : undefined,
});

export const db = drizzle(pool, { schema, mode: "default" });
export type Database = typeof db;
