import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { error, json, stripHeavyContent } from "./helpers.js";

export function registerFeedTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "get-feed",
    "Get the curated feed of posts from across the Paragraph platform",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(10)
        .describe("Number of feed items to return (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor"),
      includeContent: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include post content as markdown (default: false)"),
    },
    {
      title: "Get feed",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const { items, pagination } = await api.feed.get({
          limit: params.limit,
          cursor: params.cursor,
          includeContent: params.includeContent,
        });
        const stripped = items.map((item: Record<string, unknown>) =>
          item.post ? { ...item, post: stripHeavyContent(item.post) } : item
        );
        return json({ items: stripped, pagination });
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );
}
