# PostHog MCP Analytics — Instrumentation Report

## Summary

This project's MCP server has been instrumented with PostHog MCP analytics using **Path A** (official SDK server wrap) for both the Node.js binary and the Cloudflare Worker entry point.

Every tool call, `tools/list` response, and `initialize` handshake will emit `$mcp_*` events in PostHog once the server handles its next request. See the [event reference](https://posthog.com/docs/mcp-analytics) for the full catalog and dashboard setup.

---

## Instrumentation Path

| Entry point | Transport | Path | Flush strategy |
|---|---|---|---|
| `src/index.ts` | stdio + HTTP | Path A — `instrument(server, posthog)` | `SIGTERM` → `posthog.shutdown()` |
| `src/mcp-handler.ts` | Cloudflare Worker (stateless) | Path A — `instrument(server, posthog)` | Per-request `ctx.waitUntil(posthog.flush())` |

`@posthog/mcp` is pre-1.0 (beta); pin it to the exact version installed after `yarn install`.

---

## Files Modified

| File | Change |
|---|---|
| `src/index.ts` | Added `import { instrument } from "@posthog/mcp"`, `import { PostHog } from "posthog-node"`, module-scope `posthog` client, `instrument(server, posthog)` call in `createMcpServer()`, and `SIGTERM` shutdown handler |
| `src/mcp-handler.ts` | Added the same imports and module-scope `posthog` client, `instrument(server, posthog)` in `createParagraphMcpServer()`, and `ctx.waitUntil(posthog.flush())` at the end of each POST request |
| `package.json` | Added `@posthog/mcp` and `posthog-node` to `dependencies` |
| `tsup.config.ts` | Added `@posthog/mcp` and `posthog-node` to `noExternal` so they are bundled into the distributed binary |
| `.env` | Created with `POSTHOG_PROJECT_API_KEY` and `POSTHOG_HOST` |

---

## Manual Steps Required

### 1. Install dependencies (required — npm registry was unreachable during instrumentation)

```bash
yarn install
```

After installing, pin `@posthog/mcp` to its exact resolved version in `package.json` (it's pre-1.0 and may have breaking minor releases):

```bash
# Check the installed version
cat node_modules/@posthog/mcp/package.json | grep '"version"'
# Then pin it in package.json, e.g.:
# "@posthog/mcp": "0.3.2"  (replace with the actual version)
```

### 2. Verify build

```bash
yarn build
```

### 3. Cloudflare Worker secrets

The worker reads `POSTHOG_PROJECT_API_KEY` and `POSTHOG_HOST` via `process.env`. Set these as Wrangler secrets for the deployed worker:

```bash
wrangler secret put POSTHOG_PROJECT_API_KEY
wrangler secret put POSTHOG_HOST
```

Or add them as `[vars]` in `wrangler.jsonc` for non-secret values (host only — never put the API key in plaintext config).

### 4. Local `.env` for Node.js binary development

The `.env` file has been created with your PostHog project API key and host. Load it when running the binary locally (e.g. `dotenv -e .env paragraph-mcp`), or export the vars in your shell.

---

## What you'll see in PostHog

Once the instrumented server handles requests, navigate to [PostHog → Insights](https://us.posthog.com/project/401713) and filter for events starting with `$mcp_`:

- `$mcp_tool_call` — one per tool invocation, with tool name, duration, and error status
- `$mcp_tools_list` — per `tools/list` response
- `$mcp_initialize` — per client handshake
- `$exception` — whenever a tool throws or returns `isError: true`

Full dashboard template and event property reference: https://posthog.com/docs/mcp-analytics
