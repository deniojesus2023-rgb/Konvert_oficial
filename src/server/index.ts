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

app.listen(env.port, () => {
  console.log(`Konvert API listening on port ${env.port}`);
});
