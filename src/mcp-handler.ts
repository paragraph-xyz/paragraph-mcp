import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { registerTools } from "./tools/index.js";
import { VERSION } from "./version.js";

export interface Props {
  apiKey: string;
}

export function createParagraphMcpServer(apiKey: string) {
  const server = new McpServer({
    name: "Paragraph",
    version: VERSION,
    instructions: [
      "You are interacting with Paragraph, a publishing and newsletter platform for writers.",
      "Many tools require an API key — use get-me to check authentication and discover the user's publication.",
      "- Posts are created as drafts. Do not publish or send newsletters without explicit user approval.",
      "- Publishing makes content publicly visible and may email subscribers — this cannot be undone.",
      "- Always confirm with the user before deleting posts (deletions are irreversible).",
      "- When displaying post content, link to the original URL on paragraph.com.",
      "- Post content must be in markdown format.",
      "- Use small limits and pagination to avoid oversized responses.",
    ].join("\n"),
  });

  let api: ParagraphAPI | null = null;
  const getApi = () => {
    if (!api) {
      api = new ParagraphAPI({ apiKey });
    }
    return api;
  };

  registerTools(server, getApi);
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
        return transport.handleRequest(request);
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
