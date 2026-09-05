import jwt from "jsonwebtoken";
import { env } from "../env.js";
import type { UserRole } from "../db/schema.js";

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  accountId: string | null;
  /** Present only on a short-lived token minted by platform.impersonateAccount. */
  impersonatedBy?: string;
}

export function signAuthToken(
  payload: AuthTokenPayload,
  opts: { expiresIn?: string } = {},
): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: (opts.expiresIn ?? env.jwtExpiresIn) as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }
  const { userId, email, role, accountId, impersonatedBy } = decoded as Partial<AuthTokenPayload>;
  if (!userId || !email || !role) {
    throw new Error("Invalid token payload");
  }
  return { userId, email, role, accountId: accountId ?? null, impersonatedBy };
}
