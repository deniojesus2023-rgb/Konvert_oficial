import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../trpc/routers/_app.js";
import { createContext } from "../trpc/context.js";
import { env } from "../env.js";

const app = express();
app.use(cors());
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

// Storefront resolution relies on the Host header the browser actually
// sent (e.g. pizzaria.konvert.app), so the frontend build is served from
// this same Express origin rather than a separate static host.
const webDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
app.use(express.static(webDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"));
});

app.listen(env.port, () => {
  console.log(`Konvert API listening on port ${env.port}`);
});
