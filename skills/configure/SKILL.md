---
name: configure
description: Configure the webhook channel plugin -- set port, check status. Use when the user asks to configure webhooks, check webhook status, or set the port.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(mkdir *)
  - Bash(ls *)
---

# /webhook:configure -- Webhook Channel Configuration

Manages configuration for the webhook channel plugin.

Arguments passed: `$ARGUMENTS`

---

## State

Config file: `~/.claude/channels/webhook/sources.json`

---

## Dispatch

### No args -- status

1. Check if `~/.claude/channels/webhook/sources.json` exists.
2. Read it if present (defaults if missing).
3. Show:
   - Paired sources count
   - Pending pairings count
   - Default port: 8788 (override with WEBHOOK_PORT env var)
4. Next steps based on state:
   - No sources, no pending: "Start by having a service POST to http://localhost:8788/pair to begin pairing."
   - Pending pairings: "You have pending pairings. Run /webhook:pair <code> to approve."
   - Sources paired: "Ready. Sources can send webhooks to http://localhost:8788/webhook."

### `--port <number>`

Note: The port is set via the WEBHOOK_PORT environment variable, not a config file. Tell the user to restart Claude Code with:

```
WEBHOOK_PORT=9999 claude --dangerously-load-development-channels server:webhook
```
