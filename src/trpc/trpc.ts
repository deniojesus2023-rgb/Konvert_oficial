import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Every platform.* endpoint uses this instead of protectedProcedure — the
 * role check lives here, once, as middleware. Never reproduce this as an
 * inline `if (ctx.user.role !== "platform_admin")` inside a handler: a
 * forgotten check on one new endpoint would silently expose every
 * account on the platform to any logged-in staff member.
 */
export const platformProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "platform_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "platform_admin role required" });
  }
  return next({ ctx });
});
