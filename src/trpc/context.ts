import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { db, type Database } from "../db/client.js";
import { verifyAuthToken, type AuthTokenPayload } from "../auth/jwt.js";

export interface Context {
  db: Database;
  user: AuthTokenPayload | null;
}

function userFromHeader(authHeader: string | undefined): AuthTokenPayload | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}

export function createContext(opts: CreateExpressContextOptions): Context {
  return {
    db,
    user: userFromHeader(opts.req.headers.authorization),
  };
}

/** Test-only context builder, bypasses the express request layer. */
export function createTestContext(user: AuthTokenPayload | null, testDb: Database): Context {
  return { db: testDb, user };
}
