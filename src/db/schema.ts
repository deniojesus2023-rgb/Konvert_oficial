import { relations } from "drizzle-orm";
import {
  mysqlTable,
  varchar,
  mysqlEnum,
  timestamp,
  uniqueIndex,
  index,
  decimal,
  int,
  boolean,
  text,
} from "drizzle-orm/mysql-core";

/**
 * Two-tier tenancy model:
 *   accounts (owner / billing)  ->  stores (the real unit of isolation)
 *
 * Every business table (menu, orders, coupons, automations, ...) added in
 * later phases MUST carry a NOT NULL storeId FK and scope its "unique"
 * constraints to (storeId, field) instead of a bare global unique.
 */

export const userRoleEnum = ["platform_admin", "admin", "manager"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const accountStatusEnum = ["active", "suspended", "canceled"] as const;
export const storeStatusEnum = ["active", "paused", "closed"] as const;
export const userStatusEnum = ["active", "disabled"] as const;

export const accounts = mysqlTable("accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 191 }).notNull(),
  slug: varchar("slug", { length: 191 }).notNull(),
  status: mysqlEnum("status", accountStatusEnum).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  slugUnique: uniqueIndex("accounts_slug_unique").on(table.slug),
}));

/**
 * The unit of isolation. Every store belongs to exactly one account.
 * `slug` only needs to be unique within the owning account (internal use,
 * e.g. admin URLs). `publicSlug` is different on purpose: it's the
 * customer-facing subdomain (pizzaria.konvert.app), and subdomains are a
 * genuinely global namespace, so it carries a global UNIQUE constraint —
 * the one deliberate exception to "always scope uniqueness by store",
 * because here the store itself is the tenant boundary, not a business
 * record scoped underneath it.
 */
export const stores = mysqlTable("stores", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 36 })
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 191 }).notNull(),
  slug: varchar("slug", { length: 191 }).notNull(),
  publicSlug: varchar("public_slug", { length: 191 }).notNull(),
  primaryColor: varchar("primary_color", { length: 7 }).default("#111827"),
  logoUrl: varchar("logo_url", { length: 2048 }),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
  currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
  status: mysqlEnum("status", storeStatusEnum).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  accountSlugUnique: uniqueIndex("stores_account_id_slug_unique").on(table.accountId, table.slug),
  publicSlugUnique: uniqueIndex("stores_public_slug_unique").on(table.publicSlug),
  accountIdx: index("stores_account_id_idx").on(table.accountId),
}));

/**
 * Login identity. `accountId` is null only for platform_admin (they are not
 * scoped to any single account). admin/manager always carry the owning
 * account so authorization checks never need a join to find it.
 */
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 36 }).references(() => accounts.id, {
    onDelete: "cascade",
  }),
  email: varchar("email", { length: 191 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 191 }).notNull(),
  role: mysqlEnum("role", userRoleEnum).notNull().default("admin"),
  status: mysqlEnum("status", userStatusEnum).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
  accountIdx: index("users_account_id_idx").on(table.accountId),
}));

/**
 * Grants a `manager` user access to exactly the stores they've been
 * assigned to. Never grants access beyond one account implicitly: the
 * storeId always resolves back to a single account via `stores.accountId`.
 */
export const storeManagers = mysqlTable("store_managers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  storeId: varchar("store_id", { length: 36 })
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userStoreUnique: uniqueIndex("store_managers_user_id_store_id_unique").on(
    table.userId,
    table.storeId,
  ),
  storeIdx: index("store_managers_store_id_idx").on(table.storeId),
}));

/**
 * ---- Menu / ordering (phase 2) ----
 * Every table below carries a NOT NULL storeId from its first migration,
 * and every constraint that would look global (category slug) is scoped
 * as UNIQUE(storeId, field) instead.
 */

export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 36 }).primaryKey(),
  storeId: varchar("store_id", { length: 36 })
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 191 }).notNull(),
  slug: varchar("slug", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  storeSlugUnique: uniqueIndex("categories_store_id_slug_unique").on(table.storeId, table.slug),
  storeIdx: index("categories_store_id_idx").on(table.storeId),
}));

export const products = mysqlTable("products", {
  id: varchar("id", { length: 36 }).primaryKey(),
  storeId: varchar("store_id", { length: 36 })
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id", { length: 36 })
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 191 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: varchar("image_url", { length: 2048 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  storeIdx: index("products_store_id_idx").on(table.storeId),
  categoryIdx: index("products_category_id_idx").on(table.categoryId),
  storeActiveIdx: index("products_store_id_active_idx").on(table.storeId, table.active),
}));

export const orderStatusEnum = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "canceled",
] as const;
export type OrderStatus = (typeof orderStatusEnum)[number];

export const paymentMethodEnum = ["cash_on_delivery"] as const;
export type PaymentMethod = (typeof paymentMethodEnum)[number];

export const orders = mysqlTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  storeId: varchar("store_id", { length: 36 })
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  // null for guest checkout; set only when a logged-in user places the order.
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  status: mysqlEnum("status", orderStatusEnum).notNull().default("pending"),
  deliveryAddress: text("delivery_address").notNull(),
  paymentMethod: mysqlEnum("payment_method", paymentMethodEnum)
    .notNull()
    .default("cash_on_delivery"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  storeIdx: index("orders_store_id_idx").on(table.storeId),
  userIdx: index("orders_user_id_idx").on(table.userId),
}));

/**
 * `unitPrice` is a snapshot taken at order time and must never be
 * recomputed from the current product price — that's what makes the
 * order total stable even if the product is repriced or discontinued
 * afterwards. `storeId` is denormalized from orders/products on purpose
 * (defense in depth: every business table gets storeId directly, no
 * exceptions, even when it's technically derivable through a join).
 */
export const orderItems = mysqlTable("order_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  storeId: varchar("store_id", { length: 36 })
    .notNull()
    .references(() => stores.id, { onDelete: "cascade" }),
  orderId: varchar("order_id", { length: 36 })
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 })
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  orderIdx: index("order_items_order_id_idx").on(table.orderId),
  storeIdx: index("order_items_store_id_idx").on(table.storeId),
  productIdx: index("order_items_product_id_idx").on(table.productId),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  stores: many(stores),
  users: many(users),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  account: one(accounts, { fields: [stores.accountId], references: [accounts.id] }),
  managers: many(storeManagers),
  categories: many(categories),
  products: many(products),
  orders: many(orders),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  account: one(accounts, { fields: [users.accountId], references: [accounts.id] }),
  managedStores: many(storeManagers),
}));

export const storeManagersRelations = relations(storeManagers, ({ one }) => ({
  user: one(users, { fields: [storeManagers.userId], references: [users.id] }),
  store: one(stores, { fields: [storeManagers.storeId], references: [stores.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  store: one(stores, { fields: [categories.storeId], references: [stores.id] }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one }) => ({
  store: one(stores, { fields: [products.storeId], references: [stores.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  store: one(stores, { fields: [orderItems.storeId], references: [stores.id] }),
}));
