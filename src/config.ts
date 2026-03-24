import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname } from "path";

export interface SourceInfo {
  name: string;
  hmac_secret: string;
  callback_url: string | null;
  paired_at: string;
}

export interface PendingPairing {
  name: string;
  callback_url: string | null;
  created_at: string;
}

export interface WebhookConfig {
  sources: Record<string, SourceInfo>;
  pending_pairings: Record<string, PendingPairing>;
}

export function loadConfig(path: string): WebhookConfig {
  if (!existsSync(path)) return { sources: {}, pending_pairings: {} };
  return JSON.parse(readFileSync(path, "utf-8")) as WebhookConfig;
}

export function saveConfig(path: string, config: WebhookConfig): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2));
}

export function addSource(config: WebhookConfig, sourceId: string, info: SourceInfo): WebhookConfig {
  return { ...config, sources: { ...config.sources, [sourceId]: info } };
}

export function removeSource(config: WebhookConfig, sourceId: string): WebhookConfig {
  const { [sourceId]: _, ...rest } = config.sources;
  return { ...config, sources: rest };
}

export function getSource(config: WebhookConfig, sourceId: string): SourceInfo | undefined {
  return config.sources[sourceId];
}

export function listSources(config: WebhookConfig): Array<{ source_id: string; name: string; has_callback: boolean; paired_at: string }> {
  return Object.entries(config.sources).map(([id, info]) => ({
    source_id: id, name: info.name, has_callback: info.callback_url !== null, paired_at: info.paired_at,
  }));
}
