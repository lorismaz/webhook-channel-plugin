import { describe, expect, test, beforeEach } from "bun:test";
import { generatePairingCode, createPendingPairing, completePairing, cleanExpiredPairings } from "../src/pairing";
import { type WebhookConfig } from "../src/config";

let config: WebhookConfig;
beforeEach(() => { config = { sources: {}, pending_pairings: {} }; });

describe("generatePairingCode", () => {
  test("returns a 6-character alphanumeric string", () => {
    const code = generatePairingCode();
    expect(code.length).toBe(6);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });
  test("generates unique codes", () => {
    expect(generatePairingCode()).not.toBe(generatePairingCode());
  });
});

describe("createPendingPairing", () => {
  test("adds a pending pairing to config", () => {
    const { config: updated, code } = createPendingPairing(config, "my-svc", "https://example.com/cb");
    expect(updated.pending_pairings[code]).toBeDefined();
    expect(updated.pending_pairings[code].name).toBe("my-svc");
  });
  test("replaces existing pairing for same name", () => {
    const { config: c1, code: code1 } = createPendingPairing(config, "my-svc", null);
    const { config: c2, code: code2 } = createPendingPairing(c1, "my-svc", null);
    expect(c2.pending_pairings[code1]).toBeUndefined();
    expect(c2.pending_pairings[code2]).toBeDefined();
  });
});

describe("completePairing", () => {
  test("moves pending pairing to sources", () => {
    const { config: c1, code } = createPendingPairing(config, "my-svc", "https://example.com");
    const result = completePairing(c1, code);
    expect(result).not.toBeNull();
    expect(result!.config.pending_pairings[code]).toBeUndefined();
    expect(result!.sourceId.startsWith("src_")).toBe(true);
    expect(result!.hmacSecret.startsWith("whsec_")).toBe(true);
    expect(result!.config.sources[result!.sourceId].name).toBe("my-svc");
  });
  test("returns null for invalid code", () => {
    expect(completePairing(config, "INVALID")).toBeNull();
  });
});

describe("cleanExpiredPairings", () => {
  test("removes pairings older than 5 minutes", () => {
    config.pending_pairings["OLD123"] = { name: "expired", callback_url: null, created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() };
    config.pending_pairings["NEW456"] = { name: "fresh", callback_url: null, created_at: new Date().toISOString() };
    const cleaned = cleanExpiredPairings(config);
    expect(cleaned.pending_pairings["OLD123"]).toBeUndefined();
    expect(cleaned.pending_pairings["NEW456"]).toBeDefined();
  });
});
