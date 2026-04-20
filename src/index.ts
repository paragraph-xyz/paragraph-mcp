import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { createServer } from "http";
import { resolveApiKey } from "./config.js";
import { PARAGRAPH_SERVER_INSTRUCTIONS } from "./instructions.js";
import { registerTools, ALL_TOOLSETS, type Toolset } from "./tools/index.js";
import { VERSION } from "./version.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let transport: "stdio" | "http" = "stdio";
  let port = 3100;
  let toolsets: Toolset[] | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--http") {
      transport = "http";
    } else if (arg === "--port" && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`Invalid port: ${args[i + 1]}`);
        process.exit(1);
      }
      port = parsed;
      i++;
    } else if (arg === "--toolsets" && args[i + 1]) {
      const names = args[i + 1].split(",").filter(Boolean);
      const invalid = names.filter(
        (n) => !ALL_TOOLSETS.includes(n as Toolset)
      );
      if (invalid.length > 0) {
        console.error(
          `Unknown toolset(s): ${invalid.join(", ")}\nAvailable: ${ALL_TOOLSETS.join(", ")}`
        );
        process.exit(1);
      }
      toolsets = [...new Set(names)] as Toolset[];
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`paragraph-mcp — Paragraph MCP server

Usage:
  paragraph-mcp [options]

Options:
  --http                Use Streamable HTTP transport (default: stdio)
  --port <port>         HTTP port (default: 3100)
  --toolsets <list>     Comma-separated toolsets to enable (default: all)
                        Available: ${ALL_TOOLSETS.join(", ")}
  --help, -h            Show this help

Authentication:
  Set PARAGRAPH_API_KEY env var, or run \`paragraph login\` (CLI shares config).

Examples:
  # stdio (for Claude Desktop, Cursor, etc.)
  paragraph-mcp

  # HTTP with only posts and search tools
  paragraph-mcp --http --toolsets posts,search

  # Claude Desktop config (claude_desktop_config.json)
  {
    "mcpServers": {
      "paragraph": {
        "command": "npx",
        "args": ["@paragraph-com/mcp"],
        "env": { "PARAGRAPH_API_KEY": "your-key" }
      }
    }
  }
`);
      process.exit(0);
    }
  }

  return { transport, port, toolsets };
}

function createMcpServer(toolsets?: Toolset[]) {
  const apiKey = resolveApiKey();

  const server = new McpServer({
    name: "Paragraph",
    version: VERSION,
    instructions: PARAGRAPH_SERVER_INSTRUCTIONS,
  });

  // Lazy API client — created once per server, re-uses the same key
  let api: ParagraphAPI | null = null;
  const getApi = () => {
    if (!api) {
      api = new ParagraphAPI(apiKey ? { apiKey } : undefined);
    }
    return api;
  };

  registerTools(server, getApi, toolsets);

  return server;
}

async function startStdio(toolsets?: Toolset[]) {
  const server = createMcpServer(toolsets);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp(port: number, toolsets?: Toolset[]) {
  const httpServer = createServer(async (req, res) => {
    // Health check
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // Stateless mode: only POST is meaningful (no shared transport for GET SSE / DELETE)
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    try {
      const mcpServer = createMcpServer(toolsets);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  httpServer.on("error", (err) => {
    console.error("HTTP server error:", err.message);
    process.exit(1);
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.error(
      `Paragraph MCP server running on http://127.0.0.1:${port}`
    );
  });
}

async function main() {
  const { transport, port, toolsets } = parseArgs();

  if (transport === "http") {
    await startHttp(port, toolsets);
  } else {
    await startStdio(toolsets);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
