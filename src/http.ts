import { loadConfig, saveConfig, getSource } from "./config";
import { verifySignature, isTimestampValid } from "./auth";
import { createPendingPairing, cleanExpiredPairings, completePairing } from "./pairing";

interface HttpServerOptions {
  configPath: string;
  onNotification: (content: string, meta: Record<string, string>) => void;
  port: number;
}

export function createHttpServer(options: HttpServerOptions) {
  const { configPath, onNotification } = options;

  const server = Bun.serve({
    port: options.port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
      }

      if (req.method === "POST" && url.pathname === "/pair") {
        return handlePair(req, configPath);
      }

      if (req.method === "POST" && url.pathname === "/pair/complete") {
        return handlePairComplete(req, configPath);
      }

      if (req.method === "GET" && url.pathname === "/pair/status") {
        return handlePairStatus(req, configPath);
      }

      if (req.method === "POST" && url.pathname === "/webhook") {
        return handleWebhook(req, configPath, onNotification);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return server;
}

async function handlePair(req: Request, configPath: string): Promise<Response> {
  let body: { name?: string; callback_url?: string | null };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  if (!body.name || typeof body.name !== "string") {
    return new Response(JSON.stringify({ error: "Missing required field: name" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  let config = loadConfig(configPath);
  config = cleanExpiredPairings(config);
  const { config: updated, code } = createPendingPairing(config, body.name, body.callback_url ?? null);
  saveConfig(configPath, updated);

  return new Response(JSON.stringify({ pairing_code: code }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function handlePairComplete(req: Request, configPath: string): Promise<Response> {
  let body: { code?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  if (!body.code || typeof body.code !== "string") {
    return new Response(JSON.stringify({ error: "Missing required field: code" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  let config = loadConfig(configPath);
  const result = completePairing(config, body.code);

  if (!result) {
    return new Response(JSON.stringify({ error: "Invalid or expired pairing code" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  saveConfig(configPath, result.config);

  return new Response(JSON.stringify({
    source_id: result.sourceId,
    hmac_secret: result.hmacSecret,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function handlePairStatus(req: Request, configPath: string): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response(JSON.stringify({ error: "Missing query parameter: code" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const config = loadConfig(configPath);

  // Check if still pending
  if (config.pending_pairings[code]) {
    return new Response(JSON.stringify({ status: "pending" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  // Check if it was completed (source exists with matching name)
  // If not pending and not found, it's either expired or invalid
  return new Response(JSON.stringify({ status: "expired_or_completed" }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function handleWebhook(req: Request, configPath: string, onNotification: (content: string, meta: Record<string, string>) => void): Promise<Response> {
  const sourceId = req.headers.get("X-Source-Id");
  const signature = req.headers.get("X-Signature");
  const timestamp = req.headers.get("X-Timestamp");

  if (!sourceId || !signature || !timestamp) { console.error("[webhook] Missing headers"); return new Response("Unauthorized", { status: 401 }); }

  const config = loadConfig(configPath);
  const source = getSource(config, sourceId);
  if (!source) { console.error(`[webhook] Source not found: ${sourceId}`); return new Response("Unauthorized", { status: 401 }); }
  if (!isTimestampValid(timestamp)) { console.error(`[webhook] Invalid timestamp: ${timestamp}`); return new Response("Unauthorized", { status: 401 }); }

  const body = await req.text();
  if (!verifySignature(body, signature, source.hmac_secret)) { console.error(`[webhook] Signature mismatch. Got: ${signature}, Body: ${body}`); return new Response("Unauthorized", { status: 401 }); }

  const url = new URL(req.url);
  onNotification(body, {
    source: source.name,
    source_id: sourceId,
    path: url.pathname,
    content_type: req.headers.get("Content-Type") ?? "application/octet-stream",
  });

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
