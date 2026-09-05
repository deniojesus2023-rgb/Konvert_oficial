import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { storeSettings } from "../db/schema.js";
import { env } from "../env.js";

export type WhatsAppProvider = "twilio" | "zapi" | "none";

export interface WhatsAppSenderConfig {
  provider: WhatsAppProvider;
  from?: string;
  token?: string;
}

/** Sent messages are recorded here whenever provider "none" is used — the test/dev no-op path. */
export const sentWhatsAppLog: { storeId: string; phone: string; message: string }[] = [];

export function clearWhatsAppLog(): void {
  sentWhatsAppLog.length = 0;
}

async function sendWithTwilio(config: WhatsAppSenderConfig, phone: string, message: string): Promise<void> {
  await fetch("https://api.twilio.com/2010-04-01/Messages.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token ?? ""}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: config.from ?? "", To: phone, Body: message }),
  });
}

async function sendWithZapi(config: WhatsAppSenderConfig, phone: string, message: string): Promise<void> {
  await fetch(`https://api.z-api.io/instances/${config.from ?? ""}/token/${config.token ?? ""}/send-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, message }),
  });
}

/**
 * Resolves which sender config to use for a given store: that store's own
 * WhatsApp credentials (store_settings key "whatsappSenderConfig", a JSON
 * blob) if it has configured one, otherwise the process-wide env fallback
 * — which exists purely so dev/test environments work without every
 * store needing its own number, never as a production substitute for
 * per-store credentials.
 */
export async function resolveWhatsAppConfig(
  db: Database,
  storeId: string,
): Promise<WhatsAppSenderConfig> {
  const rows = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
  const configRow = rows.find((r) => r.key === "whatsappSenderConfig");
  if (configRow) {
    try {
      const parsed = JSON.parse(configRow.value) as WhatsAppSenderConfig;
      if (parsed.provider) return parsed;
    } catch {
      // fall through to the env default if the stored value is malformed
    }
  }

  return {
    provider: env.whatsappProvider,
    from: env.whatsappDefaultFrom,
    token: env.whatsappDefaultToken,
  };
}

/**
 * The single choke point for sending a WhatsApp message. Always resolves
 * credentials from the store passed in — callers (the journey engine
 * especially) must pass the storeId that owns the event, never a cached
 * or "current" store from somewhere else.
 */
export async function sendWhatsApp(db: Database, storeId: string, phone: string, message: string): Promise<void> {
  const config = await resolveWhatsAppConfig(db, storeId);

  switch (config.provider) {
    case "twilio":
      await sendWithTwilio(config, phone, message);
      return;
    case "zapi":
      await sendWithZapi(config, phone, message);
      return;
    case "none":
    default:
      sentWhatsAppLog.push({ storeId, phone, message });
      return;
  }
}
