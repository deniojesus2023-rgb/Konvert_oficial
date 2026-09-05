import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { storesRouter } from "./stores.js";

export const appRouter = router({
  auth: authRouter,
  stores: storesRouter,
});

export type AppRouter = typeof appRouter;
