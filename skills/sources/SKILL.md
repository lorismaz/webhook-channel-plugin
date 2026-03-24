---
name: sources
description: List or revoke paired webhook sources. Use when the user asks "show webhook sources", "list paired sources", or "revoke source".
user-invocable: true
allowed-tools:
  - Read
  - Write
---

# /webhook:sources -- Manage Paired Webhook Sources

Lists and manages paired webhook sources.

Arguments passed: `$ARGUMENTS`

---

## State

Config file: `~/.claude/channels/webhook/sources.json`

---

## Dispatch

### No args -- list sources

1. Read `~/.claude/channels/webhook/sources.json` (defaults if missing).
2. If no sources, say "No paired sources."
3. For each source, show:
   - Name
   - Source ID
   - Has callback URL: yes/no
   - Paired at

### `revoke <source_id>`

1. Read `~/.claude/channels/webhook/sources.json`.
2. Look up `sources[<source_id>]`. If not found, tell the user.
3. Delete `sources[<source_id>]`.
4. Write back.
5. Confirm: "Revoked source "name" (source_id)."
