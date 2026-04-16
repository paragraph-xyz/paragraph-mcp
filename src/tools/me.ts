import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { error, json } from "./helpers.js";

export function registerMeTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "get-me",
    "Get the publication associated with the authenticated API key. Requires API key.",
    {},
    {
      title: "Get my publication",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const api = getApi();
        const result = await api.me.get();
        return json(result);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );
}
