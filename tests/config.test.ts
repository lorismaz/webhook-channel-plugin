import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadConfig, saveConfig, addSource, removeSource, getSource, listSources,
  type WebhookConfig,
} from "../src/config";

let testDir: string;
let configPath: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "webhook-test-"));
  configPath = join(testDir, "sources.json");
});
afterEach(() => { rmSync(testDir, { recursive: true }); });

describe("loadConfig", () => {
  test("returns empty config when file does not exist", () => {
    const config = loadConfig(configPath);
    expect(config.sources).toEqual({});
    expect(config.pending_pairings).toEqual({});
  });
  test("reads existing config", () => {
    const data: WebhookConfig = {
      sources: { src_abc: { name: "test", hmac_secret: "whsec_123", callback_url: null, paired_at: "2026-01-01T00:00:00Z" } },
      pending_pairings: {},
    };
    Bun.write(configPath, JSON.stringify(data));
    const config = loadConfig(configPath);
    expect(config.sources.src_abc.name).toBe("test");
  });
});

describe("saveConfig", () => {
  test("writes config to file", () => {
    saveConfig(configPath, { sources: {}, pending_pairings: {} });
    const raw = Bun.file(configPath).text();
    expect(raw).resolves.toContain("sources");
  });
});

describe("addSource", () => {
  test("adds a source to config", () => {
    const config = loadConfig(configPath);
    const updated = addSource(config, "src_abc", {
      name: "my-service", hmac_secret: "whsec_xyz", callback_url: "https://example.com/cb", paired_at: "2026-01-01T00:00:00Z",
    });
    expect(updated.sources.src_abc.name).toBe("my-service");
  });
});

describe("removeSource", () => {
  test("removes a source from config", () => {
    let config = loadConfig(configPath);
    config = addSource(config, "src_abc", { name: "test", hmac_secret: "whsec_123", callback_url: null, paired_at: "2026-01-01T00:00:00Z" });
    config = removeSource(config, "src_abc");
    expect(config.sources.src_abc).toBeUndefined();
  });
});

describe("getSource", () => {
  test("returns source if exists", () => {
    let config = loadConfig(configPath);
    config = addSource(config, "src_abc", { name: "test", hmac_secret: "whsec_123", callback_url: null, paired_at: "2026-01-01T00:00:00Z" });
    expect(getSource(config, "src_abc")?.name).toBe("test");
  });
  test("returns undefined if not exists", () => {
    expect(getSource(loadConfig(configPath), "src_nope")).toBeUndefined();
  });
});

describe("listSources", () => {
  test("returns array of source summaries", () => {
    let config = loadConfig(configPath);
    config = addSource(config, "src_abc", { name: "svc-a", hmac_secret: "whsec_123", callback_url: "https://a.com", paired_at: "2026-01-01T00:00:00Z" });
    config = addSource(config, "src_def", { name: "svc-b", hmac_secret: "whsec_456", callback_url: null, paired_at: "2026-01-02T00:00:00Z" });
    const list = listSources(config);
    expect(list.length).toBe(2);
    expect(list[0].source_id).toBe("src_abc");
    expect(list[1].has_callback).toBe(false);
  });
});
