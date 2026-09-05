import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { storesRouter } from "./stores.js";
import { categoriesRouter } from "./categories.js";
import { productsRouter } from "./products.js";
import { ordersRouter } from "./orders.js";

export const appRouter = router({
  auth: authRouter,
  stores: storesRouter,
  categories: categoriesRouter,
  products: productsRouter,
  orders: ordersRouter,
});

export type AppRouter = typeof appRouter;
