import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  searchPostsQueryParams,
  searchBlogsQueryParams,
  searchCoinsQueryParams,
} from "@paragraph-com/sdk/zod";
import { json, toError } from "./helpers.js";

export function registerSearchTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "search-posts",
    {
      title: "Search posts",
      description: "Search for posts across the Paragraph platform",
      inputSchema: {
        query: searchPostsQueryParams.shape.q.unwrap().describe("Search query"),
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
        const results = await api.search.posts(params.query);
        return json(results);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "search-blogs",
    {
      title: "Search publications",
      description: "Search for publications/blogs across the Paragraph platform",
      inputSchema: {
        query: searchBlogsQueryParams.shape.q.unwrap().describe("Search query"),
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
        const results = await api.search.blogs(params.query);
        return json(results);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "search-coins",
    {
      title: "Search coins",
      description: "Search for coins/tokens across the Paragraph platform",
      inputSchema: {
        query: searchCoinsQueryParams.shape.q.unwrap().describe("Search query"),
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
        const results = await api.search.coins(params.query);
        return json(results);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
