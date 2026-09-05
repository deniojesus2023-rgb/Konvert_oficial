import { relations } from "drizzle-orm";
import {
  mysqlTable,
  varchar,
  mysqlEnum,
  timestamp,
  uniqueIndex,
  index,
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
 * Slugs only need to be unique within the owning account, never globally.
 */
export const stores = mysqlTable("stores", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 36 })
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 191 }).notNull(),
  slug: varchar("slug", { length: 191 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
  currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
  status: mysqlEnum("status", storeStatusEnum).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  accountSlugUnique: uniqueIndex("stores_account_id_slug_unique").on(table.accountId, table.slug),
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

export const accountsRelations = relations(accounts, ({ many }) => ({
  stores: many(stores),
  users: many(users),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  account: one(accounts, { fields: [stores.accountId], references: [accounts.id] }),
  managers: many(storeManagers),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  account: one(accounts, { fields: [users.accountId], references: [accounts.id] }),
  managedStores: many(storeManagers),
}));

export const storeManagersRelations = relations(storeManagers, ({ one }) => ({
  user: one(users, { fields: [storeManagers.userId], references: [users.id] }),
  store: one(stores, { fields: [storeManagers.storeId], references: [stores.id] }),
}));
