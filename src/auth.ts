import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const TIMESTAMP_TOLERANCE_S = 300;

export function generateHmacSecret(): string {
  return "whsec_" + randomBytes(32).toString("hex");
}

export function generateSourceId(): string {
  return "src_" + randomBytes(16).toString("hex");
}

export function signPayload(body: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return "sha256=" + sig;
}

export function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = signPayload(body, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isTimestampValid(timestamp: string): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= TIMESTAMP_TOLERANCE_S;
}
