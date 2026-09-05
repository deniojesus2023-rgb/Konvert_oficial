import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { storesRouter } from "./stores.js";
import { categoriesRouter } from "./categories.js";
import { productsRouter } from "./products.js";
import { ordersRouter } from "./orders.js";
import { storeSettingsRouter } from "./storeSettings.js";
import { automationsRouter } from "./automations.js";
import { crmRouter } from "./crm.js";
import { notificationsRouter } from "./notifications.js";
import { platformRouter } from "./platform.js";

export const appRouter = router({
  auth: authRouter,
  stores: storesRouter,
  categories: categoriesRouter,
  products: productsRouter,
  orders: ordersRouter,
  storeSettings: storeSettingsRouter,
  automations: automationsRouter,
  crm: crmRouter,
  notifications: notificationsRouter,
  platform: platformRouter,
});

export type AppRouter = typeof appRouter;
