import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { accounts, stores, users } from "../../db/schema.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import { signAuthToken } from "../../auth/jwt.js";
import { slugify } from "../../util/slug.js";
import { protectedProcedure, publicProcedure, router } from "../trpc.js";

const signupInput = z.object({
  accountName: z.string().min(2).max(191),
  storeName: z.string().min(2).max(191),
  adminName: z.string().min(2).max(191),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "loja";
  let candidate = root;
  let attempt = 0;
  while (await isTaken(candidate)) {
    attempt += 1;
    candidate = `${root}-${randomUUID().slice(0, 6)}`;
    if (attempt > 5) break;
  }
  return candidate;
}

export const authRouter = router({
  signup: publicProcedure.input(signupInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email));
    if (existing.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
    }

    const accountId = randomUUID();
    const storeId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await hashPassword(input.password);

    const accountSlug = await uniqueSlug(input.accountName, async (candidate) => {
      const rows = await ctx.db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.slug, candidate));
      return rows.length > 0;
    });

    // publicSlug is the storefront subdomain, a genuinely global namespace,
    // so it needs its own uniqueness check independent of the account.
    const storePublicSlug = await uniqueSlug(input.storeName, async (candidate) => {
      const rows = await ctx.db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.publicSlug, candidate));
      return rows.length > 0;
    });

    await ctx.db.transaction(async (tx) => {
      await tx.insert(accounts).values({ id: accountId, name: input.accountName, slug: accountSlug });
      await tx.insert(stores).values({
        id: storeId,
        accountId,
        name: input.storeName,
        slug: slugify(input.storeName) || "loja",
        publicSlug: storePublicSlug,
      });
      await tx.insert(users).values({
        id: userId,
        accountId,
        email: input.email,
        passwordHash,
        name: input.adminName,
        role: "admin",
      });
    });

    const token = signAuthToken({ userId, email: input.email, role: "admin", accountId });

    return {
      token,
      user: { id: userId, email: input.email, name: input.adminName, role: "admin" as const, accountId },
      account: { id: accountId, name: input.accountName, slug: accountSlug },
      store: { id: storeId, name: input.storeName, publicSlug: storePublicSlug },
    };
  }),

  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email));
    if (!user || user.status !== "active") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
    }

    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      accountId: user.accountId,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        accountId: user.accountId,
      },
    };
  }),

  /** Identity check for the admin panel: who is logged in, and what role/account they carry. */
  me: protectedProcedure.query(({ ctx }) => ctx.user),
});
