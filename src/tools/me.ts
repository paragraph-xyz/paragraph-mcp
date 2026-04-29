import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { json, toError } from "./helpers.js";

export function registerMeTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "get-me",
    {
      title: "Get my publication",
      description:
        "Get the publication associated with the authenticated API key. Requires API key.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const api = getApi();
        const result = await api.me.get();
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
