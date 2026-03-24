import { describe, expect, test } from "bun:test";
import {
  generateHmacSecret,
  generateSourceId,
  signPayload,
  verifySignature,
  isTimestampValid,
} from "../src/auth";

describe("generateHmacSecret", () => {
  test("returns a string prefixed with whsec_", () => {
    const secret = generateHmacSecret();
    expect(secret.startsWith("whsec_")).toBe(true);
  });
  test("generates unique secrets", () => {
    expect(generateHmacSecret()).not.toBe(generateHmacSecret());
  });
  test("hex portion is 64 characters (32 bytes)", () => {
    expect(generateHmacSecret().slice("whsec_".length).length).toBe(64);
  });
});

describe("generateSourceId", () => {
  test("returns a string prefixed with src_", () => {
    expect(generateSourceId().startsWith("src_")).toBe(true);
  });
  test("hex portion is 32 characters (16 bytes)", () => {
    expect(generateSourceId().slice("src_".length).length).toBe(32);
  });
});

describe("signPayload", () => {
  test("returns sha256= prefixed signature", () => {
    expect(signPayload("hello", "whsec_abc123").startsWith("sha256=")).toBe(true);
  });
  test("same input produces same signature", () => {
    expect(signPayload("hello", "whsec_abc123")).toBe(signPayload("hello", "whsec_abc123"));
  });
  test("different body produces different signature", () => {
    expect(signPayload("hello", "whsec_abc123")).not.toBe(signPayload("world", "whsec_abc123"));
  });
});

describe("verifySignature", () => {
  test("returns true for valid signature", () => {
    const secret = "whsec_abc123";
    const body = '{"test": true}';
    const sig = signPayload(body, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });
  test("returns false for tampered body", () => {
    const sig = signPayload("original", "whsec_abc123");
    expect(verifySignature("tampered", sig, "whsec_abc123")).toBe(false);
  });
  test("returns false for wrong secret", () => {
    const sig = signPayload("test", "whsec_secret1");
    expect(verifySignature("test", sig, "whsec_secret2")).toBe(false);
  });
});

describe("isTimestampValid", () => {
  test("returns true for current timestamp", () => {
    expect(isTimestampValid(Math.floor(Date.now() / 1000).toString())).toBe(true);
  });
  test("returns false for timestamp older than 5 minutes", () => {
    expect(isTimestampValid((Math.floor(Date.now() / 1000) - 301).toString())).toBe(false);
  });
  test("returns false for non-numeric timestamp", () => {
    expect(isTimestampValid("not-a-number")).toBe(false);
  });
});
