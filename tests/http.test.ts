import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createHttpServer } from "../src/http";
import { signPayload } from "../src/auth";
import { loadConfig, saveConfig, addSource } from "../src/config";

let testDir: string;
let configPath: string;
let server: ReturnType<typeof createHttpServer>;
let port: number;
let notifications: Array<{ content: string; meta: Record<string, string> }>;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "webhook-http-test-"));
  configPath = join(testDir, "sources.json");
  notifications = [];
  const onNotification = (content: string, meta: Record<string, string>) => {
    notifications.push({ content, meta });
  };
  server = createHttpServer({ configPath, onNotification, port: 0 });
  port = server.port;
});

afterEach(() => {
  server.stop();
  rmSync(testDir, { recursive: true });
});

describe("GET /health", () => {
  test("returns 200", async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
  });
});

describe("POST /pair", () => {
  test("returns pairing code", async () => {
    const res = await fetch(`http://localhost:${port}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-svc", callback_url: "https://example.com/cb" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pairing_code).toBeDefined();
    expect(data.pairing_code.length).toBe(6);
  });
  test("rejects missing name", async () => {
    const res = await fetch(`http://localhost:${port}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /webhook", () => {
  test("rejects unpaired source", async () => {
    const res = await fetch(`http://localhost:${port}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Source-Id": "src_unknown", "X-Signature": "sha256=bad", "X-Timestamp": Math.floor(Date.now() / 1000).toString() },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  test("accepts valid signed request from paired source", async () => {
    const secret = "whsec_testsecret123";
    let config = loadConfig(configPath);
    config = addSource(config, "src_test", { name: "test-svc", hmac_secret: secret, callback_url: null, paired_at: new Date().toISOString() });
    saveConfig(configPath, config);

    const body = '{"event": "test"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signPayload(body, secret);

    const res = await fetch(`http://localhost:${port}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Source-Id": "src_test", "X-Signature": signature, "X-Timestamp": timestamp },
      body,
    });
    expect(res.status).toBe(200);
    expect(notifications.length).toBe(1);
    expect(notifications[0].meta.source).toBe("test-svc");
  });

  test("rejects invalid signature", async () => {
    const secret = "whsec_testsecret123";
    let config = loadConfig(configPath);
    config = addSource(config, "src_test", { name: "test-svc", hmac_secret: secret, callback_url: null, paired_at: new Date().toISOString() });
    saveConfig(configPath, config);

    const res = await fetch(`http://localhost:${port}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Source-Id": "src_test", "X-Signature": "sha256=invalid", "X-Timestamp": Math.floor(Date.now() / 1000).toString() },
      body: '{"event": "test"}',
    });
    expect(res.status).toBe(401);
  });

  test("rejects expired timestamp", async () => {
    const secret = "whsec_testsecret123";
    let config = loadConfig(configPath);
    config = addSource(config, "src_test", { name: "test-svc", hmac_secret: secret, callback_url: null, paired_at: new Date().toISOString() });
    saveConfig(configPath, config);

    const body = '{"event": "test"}';
    const signature = signPayload(body, secret);

    const res = await fetch(`http://localhost:${port}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Source-Id": "src_test", "X-Signature": signature, "X-Timestamp": (Math.floor(Date.now() / 1000) - 400).toString() },
      body,
    });
    expect(res.status).toBe(401);
  });
});
