# webhook-channel-plugin

A generic webhook channel plugin for Claude Code. Lets external services push events into Claude Code sessions via HMAC-authenticated webhooks, with interactive pairing and reply capability.

## Prerequisites

- [Bun](https://bun.sh) runtime
- Claude Code 2.1.80+

## Install

```bash
bun install
```

## Start with Claude Code

```bash
# Development:
claude --dangerously-load-development-channels server:webhook

# After approval:
claude --channels webhook@lorismaz/webhook-channel-plugin
```

The HTTP server defaults to port **8788**. Override with the `WEBHOOK_PORT` environment variable.

## Pair a service

Pairing establishes a trusted relationship between an external service and your Claude Code session.

### 1. Request a pairing code

The service POSTs to `/pair` with its name and an optional callback URL:

```bash
curl -X POST http://localhost:8788/pair \
  -H "Content-Type: application/json" \
  -d '{"name": "my-service", "callback_url": "https://my-service.example.com/hook"}'
```

Response:

```json
{"pairing_code": "A3KX9Z"}
```

### 2. Complete the pairing

**Option A** -- in Claude Code terminal (requires the plugin to be installed, not just loaded as a dev channel):

```
/webhook:pair A3KX9Z
```

**Option B** -- via HTTP (works in all setups, including development):

```bash
curl -X POST http://localhost:8788/pair/complete \
  -H "Content-Type: application/json" \
  -d '{"code": "A3KX9Z"}'
```

Both return the credentials:

```json
{"source_id": "src_abc123...", "hmac_secret": "whsec_xyz789..."}
```

Store the `source_id` and `hmac_secret` -- they are used to authenticate all future webhook requests.

Pairing codes expire after 5 minutes.

## Send webhooks

Sign requests with HMAC-SHA256 using the full `hmac_secret` (including the `whsec_` prefix):

```
sha256=HMAC-SHA256(request_body, hmac_secret)
```

Example:

```bash
BODY='{"event": "deploy", "status": "success"}'
SECRET="whsec_your_hmac_secret"
TIMESTAMP=$(date +%s)
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/.*= //')

curl -X POST http://localhost:8788/webhook \
  -H "Content-Type: application/json" \
  -H "X-Source-Id: src_your_source_id" \
  -H "X-Signature: sha256=$SIG" \
  -H "X-Timestamp: $TIMESTAMP" \
  -d "$BODY"
```

A successful delivery returns:

```json
{"received": true}
```

## Reply tool

Claude can send a reply back to the originating service using the `webhook_reply` tool:

```
webhook_reply(source_id, payload)
```

This POSTs the `payload` as JSON to the source's `callback_url`, signed with HMAC using the same secret. The request includes `X-Source-Id`, `X-Signature`, and `X-Timestamp` headers so the receiving service can verify authenticity.

## Security

- **HMAC-SHA256 signatures** -- every request (both inbound and outbound) is signed.
- **5-minute timestamp window** -- requests with a timestamp more than 300 seconds from server time are rejected.
- **Timing-safe comparison** -- signature verification uses `timingSafeEqual` to prevent timing attacks.
- **Pairing requires terminal access** -- a pairing code must be entered directly in the Claude Code terminal or via the local `/pair/complete` endpoint.

## HTTP endpoints

| Method | Path             | Auth | Description                                      |
|--------|------------------|------|--------------------------------------------------|
| GET    | `/health`        | None | Returns `{"status": "ok"}`                       |
| POST   | `/pair`          | None | Initiate pairing; returns a pairing code         |
| POST   | `/pair/complete` | None | Complete pairing with code; returns credentials  |
| GET    | `/pair/status`   | None | Check pairing status (`?code=XXXXXX`)            |
| POST   | `/webhook`       | HMAC | Deliver a signed webhook event to Claude Code    |

## Configuration

Paired sources are persisted at:

```
~/.claude/channels/webhook/sources.json
```

Each entry stores the source name, HMAC secret, callback URL, and the time it was paired.

## MCP server config

The `.mcp.json` in this repo registers the server:

```json
{
  "mcpServers": {
    "webhook": {
      "command": "bun",
      "args": ["run", "src/index.ts"],
      "cwd": "/path/to/webhook-channel-plugin"
    }
  }
}
```
