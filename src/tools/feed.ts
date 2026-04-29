import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPostsFeed200ItemsItem } from "@paragraph-com/sdk";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { getPostsFeedQueryParams } from "@paragraph-com/sdk/zod";
import { json, stripHeavyContent, toError } from "./helpers.js";

export function registerFeedTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "get-feed",
    {
      title: "Get feed",
      description:
        "Get the curated feed of posts from across the Paragraph platform",
      inputSchema: {
        limit: getPostsFeedQueryParams.shape.limit.describe(
          "Number of feed items to return (default: 10). Keep this small to avoid oversized responses — use pagination to retrieve more."
        ),
        cursor: getPostsFeedQueryParams.shape.cursor,
        includeContent: getPostsFeedQueryParams.shape.includeContent
          .unwrap()
          .default(false)
          .describe("Include post content as markdown (default: false)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const { items, pagination } = await api.feed.get({
          limit: params.limit,
          cursor: params.cursor,
          includeContent: params.includeContent,
        });
        const stripped = items.map((item: GetPostsFeed200ItemsItem) =>
          item.post ? { ...item, post: stripHeavyContent(item.post) } : item
        );
        return json({ items: stripped, pagination });
      } catch (err) {
        return toError(err);
      }
    }
  );
}
