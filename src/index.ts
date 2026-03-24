import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "path";
import { homedir } from "os";
import { createHttpServer } from "./http";
import { loadConfig, saveConfig, getSource, listSources, removeSource } from "./config";
import { completePairing } from "./pairing";
import { signPayload } from "./auth";

const CONFIG_DIR = join(homedir(), ".claude", "channels", "webhook");
const CONFIG_PATH = join(CONFIG_DIR, "sources.json");
const PORT = parseInt(process.env.WEBHOOK_PORT || "8788");

const mcp = new McpServer(
  { name: "webhook-channel", version: "0.1.0" },
  { capabilities: { experimental: { "claude/channel": {} } } }
);

// Tool: Complete a pairing by entering the code
mcp.tool(
  "webhook_pair",
  "Complete pairing for a webhook source by entering the pairing code",
  { code: z.string().describe("The 6-character pairing code") },
  async ({ code }) => {
    let config = loadConfig(CONFIG_PATH);
    const result = completePairing(config, code);

    if (!result) {
      return { content: [{ type: "text" as const, text: `Pairing failed: invalid or expired code "${code}"` }] };
    }

    saveConfig(CONFIG_PATH, result.config);

    const source = result.config.sources[result.sourceId];
    return {
      content: [{ type: "text" as const, text: `Paired "${source.name}" successfully.\nSource ID: ${result.sourceId}\nHMAC Secret: ${result.hmacSecret}\nCallback URL: ${source.callback_url ?? "none"}` }],
    };
  }
);

// Tool: List all paired sources
mcp.tool(
  "webhook_sources",
  "List all paired webhook sources",
  {},
  async () => {
    const config = loadConfig(CONFIG_PATH);
    const sources = listSources(config);

    if (sources.length === 0) {
      return { content: [{ type: "text" as const, text: "No paired sources." }] };
    }

    const lines = sources.map(
      (s) => `- ${s.name} (${s.source_id}) | callback: ${s.has_callback ? "yes" : "no"} | paired: ${s.paired_at}`
    );
    return { content: [{ type: "text" as const, text: `Paired sources:\n${lines.join("\n")}` }] };
  }
);

// Tool: Revoke a paired source
mcp.tool(
  "webhook_revoke",
  "Remove a paired webhook source",
  { source_id: z.string().describe("The source_id to revoke") },
  async ({ source_id }) => {
    let config = loadConfig(CONFIG_PATH);
    const source = getSource(config, source_id);

    if (!source) {
      return { content: [{ type: "text" as const, text: `Source ${source_id} not found` }] };
    }

    config = removeSource(config, source_id);
    saveConfig(CONFIG_PATH, config);
    return { content: [{ type: "text" as const, text: `Revoked source "${source.name}" (${source_id})` }] };
  }
);

// Tool: Reply to a source
mcp.tool(
  "webhook_reply",
  "Send a reply to a paired webhook source via its callback URL",
  {
    source_id: z.string().describe("The source_id to reply to"),
    payload: z.record(z.unknown()).describe("JSON payload to send"),
  },
  async ({ source_id, payload }) => {
    const config = loadConfig(CONFIG_PATH);
    const source = getSource(config, source_id);

    if (!source) {
      return { content: [{ type: "text" as const, text: `Error: Source ${source_id} not found` }] };
    }

    if (!source.callback_url) {
      return { content: [{ type: "text" as const, text: `Error: Source ${source_id} has no callback URL` }] };
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signPayload(body, source.hmac_secret);

    try {
      const res = await fetch(source.callback_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Source-Id": source_id,
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
        body,
      });

      return {
        content: [{ type: "text" as const, text: `Reply sent to ${source.name} (${source.callback_url}): ${res.status} ${res.statusText}` }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error sending reply: ${err}` }] };
    }
  }
);

const httpServer = createHttpServer({
  configPath: CONFIG_PATH,
  port: PORT,
  onNotification: async (content, meta) => {
    await mcp.server.notification({
      method: "notifications/claude/channel",
      params: { content, meta },
    });
  },
});

console.error(`[webhook-channel] HTTP server listening on port ${httpServer.port}`);
console.error(`[webhook-channel] Config: ${CONFIG_PATH}`);

const transport = new StdioServerTransport();
await mcp.connect(transport);
