import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit's own migrator connection is configured separately from the
// app's runtime pool (src/db/client.ts) and, unlike it, its `url`-based
// mysql credentials have no `ssl` option at all — only the discrete
// host/port/user/password/database form does. So for TLS-only providers
// (TiDB Cloud, PlanetScale) we parse DATABASE_URL ourselves and pass ssl
// explicitly, instead of handing drizzle-kit the raw connection string.
const databaseUrl = new URL(process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/konvert");
const databaseSsl = (process.env.DATABASE_SSL ?? "true") !== "false";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: databaseUrl.pathname.replace(/^\//, ""),
    ssl: databaseSsl ? {} : undefined,
  },
});
