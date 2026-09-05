import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL", "mysql://root:root@127.0.0.1:3306/konvert"),
  databaseSsl: (process.env.DATABASE_SSL ?? "true") !== "false",
  jwtSecret: required("JWT_SECRET", "dev-only-insecure-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  port: Number(process.env.PORT ?? 3000),
  // Fallback WhatsApp sender used only when a store hasn't configured its
  // own number (store_settings key "whatsappSenderConfig") — meant for
  // dev/test environments, never a substitute for per-store credentials
  // in production.
  whatsappProvider: (process.env.WHATSAPP_PROVIDER ?? "none") as "twilio" | "zapi" | "none",
  whatsappDefaultFrom: process.env.WHATSAPP_DEFAULT_FROM,
  whatsappDefaultToken: process.env.WHATSAPP_DEFAULT_TOKEN,
};
