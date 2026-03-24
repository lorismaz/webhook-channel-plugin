import { randomBytes } from "crypto";
import { generateHmacSecret, generateSourceId } from "./auth";
import { type WebhookConfig, type PendingPairing } from "./config";

const PAIRING_EXPIRY_MS = 5 * 60 * 1000;

export function generatePairingCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(6);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

export function createPendingPairing(config: WebhookConfig, name: string, callbackUrl: string | null): { config: WebhookConfig; code: string } {
  const pending = { ...config.pending_pairings };
  for (const [code, pairing] of Object.entries(pending)) {
    if (pairing.name === name) delete pending[code];
  }
  const code = generatePairingCode();
  pending[code] = { name, callback_url: callbackUrl, created_at: new Date().toISOString() };
  return { config: { ...config, pending_pairings: pending }, code };
}

export function completePairing(config: WebhookConfig, code: string): { config: WebhookConfig; sourceId: string; hmacSecret: string } | null {
  const pairing = config.pending_pairings[code];
  if (!pairing) return null;
  if (Date.now() - new Date(pairing.created_at).getTime() > PAIRING_EXPIRY_MS) return null;

  const sourceId = generateSourceId();
  const hmacSecret = generateHmacSecret();
  const { [code]: _, ...remainingPairings } = config.pending_pairings;

  return {
    config: {
      sources: { ...config.sources, [sourceId]: { name: pairing.name, hmac_secret: hmacSecret, callback_url: pairing.callback_url, paired_at: new Date().toISOString() } },
      pending_pairings: remainingPairings,
    },
    sourceId,
    hmacSecret,
  };
}

export function cleanExpiredPairings(config: WebhookConfig): WebhookConfig {
  const now = Date.now();
  const pending: Record<string, PendingPairing> = {};
  for (const [code, pairing] of Object.entries(config.pending_pairings)) {
    if (now - new Date(pairing.created_at).getTime() <= PAIRING_EXPIRY_MS) pending[code] = pairing;
  }
  return { ...config, pending_pairings: pending };
}
