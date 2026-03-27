import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { error, json } from "./helpers.js";

export function registerSearchTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "search-posts",
    "Search for posts across the Paragraph platform",
    {
      query: z.string().min(1).describe("Search query"),
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
      query: z.string().min(1).describe("Search query"),
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
      query: z.string().min(1).describe("Search query"),
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
