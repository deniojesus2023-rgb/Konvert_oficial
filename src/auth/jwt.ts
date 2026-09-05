import jwt from "jsonwebtoken";
import { env } from "../env.js";
import type { UserRole } from "../db/schema.js";

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  accountId: string | null;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }
  const { userId, email, role, accountId } = decoded as Partial<AuthTokenPayload>;
  if (!userId || !email || !role) {
    throw new Error("Invalid token payload");
  }
  return { userId, email, role, accountId: accountId ?? null };
}
