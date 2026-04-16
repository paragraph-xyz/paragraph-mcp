import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  searchPostsQueryParams,
  searchBlogsQueryParams,
  searchCoinsQueryParams,
} from "@paragraph-com/sdk/zod";
import { error, json } from "./helpers.js";

export function registerSearchTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "search-posts",
    "Search for posts across the Paragraph platform",
    {
      query: searchPostsQueryParams.shape.q.unwrap().describe("Search query"),
    },
    {
      title: "Search posts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const results = await api.search.posts(params.query);
        return json(results);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "search-blogs",
    "Search for publications/blogs across the Paragraph platform",
    {
      query: searchBlogsQueryParams.shape.q.unwrap().describe("Search query"),
    },
    {
      title: "Search publications",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const results = await api.search.blogs(params.query);
        return json(results);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "search-coins",
    "Search for coins/tokens across the Paragraph platform",
    {
      query: searchCoinsQueryParams.shape.q.unwrap().describe("Search query"),
    },
    {
      title: "Search coins",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const results = await api.search.coins(params.query);
        return json(results);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );
}
