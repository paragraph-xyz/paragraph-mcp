import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { instrument } from "@posthog/mcp";
import type { PostHog, EventMessage } from "posthog-node";
import { PARAGRAPH_SERVER_INSTRUCTIONS } from "./instructions.js";
import { beforeSendMcpEvent } from "./posthog-before-send.js";
import { registerTools } from "./tools/index.js";
import { VERSION } from "./version.js";

const POSTHOG_PROJECT_API_KEY = process.env.POSTHOG_PROJECT_API_KEY ?? "";
const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
const pendingPostHogEvents: EventMessage[] = [];
const posthogCaptureSink = {
  capture(event: EventMessage) {
    pendingPostHogEvents.push(event);
  },
} as PostHog;

async function capturePostHogEvent(event: EventMessage) {
  if (!POSTHOG_PROJECT_API_KEY) {
    return;
  }

  const properties = { ...event.properties };
  if (event.groups && Object.keys(event.groups).length > 0) {
    properties.$groups ??= event.groups;
  }
  if (event.uuid) {
    properties.$insert_id ??= event.uuid;
  }

  const response = await fetch(
    `${POSTHOG_HOST.replace(/\/$/, "")}/capture/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_API_KEY,
        event: event.event,
        distinct_id: event.distinctId ?? "anonymous",
        properties,
        timestamp: event.timestamp?.toISOString(),
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `PostHog capture failed with ${response.status}: ${body.slice(0, 500)}`
    );
  }
}

async function flushPostHogAfterCapture() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const events = pendingPostHogEvents.splice(0);
  const results = await Promise.allSettled(events.map(capturePostHogEvent));

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[posthog] capture failed", {
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  }
}

export interface Props {
  apiKey: string;
}

export function createParagraphMcpServer(apiKey: string) {
  const server = new McpServer({
    name: "Paragraph",
    version: VERSION,
    instructions: PARAGRAPH_SERVER_INSTRUCTIONS,
  });

  let api: ParagraphAPI | null = null;
  const getApi = () => {
    if (!api) {
      api = new ParagraphAPI({ apiKey });
    }
    return api;
  };

  registerTools(server, getApi);
  instrument(server, posthogCaptureSink, { beforeSend: beforeSendMcpEvent });
  return server;
}

/**
 * MCP request handler — called by the OAuthProvider after token validation.
 *
 * Supports two transports that MCP clients may use:
 *
 * 1. **Legacy SSE** — client opens `GET /mcp`, receives an `event: endpoint`
 *    telling it where to POST messages, then sends JSON-RPC via POST.
 * 2. **Streamable HTTP** — client sends `POST /mcp` directly with JSON-RPC.
 *
 * The OAuth provider injects the Paragraph API key into `ctx.props`.
 */
export const mcpHandler = {
  async fetch(
    request: Request,
    _env: unknown,
    ctx: ExecutionContext
  ): Promise<Response> {
    const props = (ctx as ExecutionContext & { props?: Props }).props;
    if (!props?.apiKey) {
      return new Response("Unauthorized", { status: 401 });
    }

    // -----------------------------------------------------------------
    // GET — Legacy SSE: send endpoint event, keep stream alive
    // -----------------------------------------------------------------
    if (request.method === "GET") {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      const endpointUrl = new URL(request.url);
      endpointUrl.pathname = "/mcp/message";
      writer.write(
        encoder.encode(
          `event: endpoint\ndata: ${endpointUrl.pathname}${endpointUrl.search}\n\n`
        )
      );

      const keepAlive = setInterval(() => {
        writer.write(encoder.encode(":keepalive\n\n")).catch(() => {
          clearInterval(keepAlive);
        });
      }, 10_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        writer.close().catch(() => {});
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    // -----------------------------------------------------------------
    // POST — Streamable HTTP (handles both /mcp and /mcp/message)
    // -----------------------------------------------------------------
    if (request.method === "POST") {
      try {
        const server = createParagraphMcpServer(props.apiKey);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);
        const response = await transport.handleRequest(request);
        ctx.waitUntil(flushPostHogAfterCapture());
        return response;
      } catch (err) {
        console.error("[mcp] handler error", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        return new Response("Internal server error", { status: 500 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
