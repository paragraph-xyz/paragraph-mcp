import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { error, json } from "./helpers.js";

export function registerSubscriberTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "list-subscribers",
    "List subscribers for your publication with pagination. Requires API key.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe("Number of subscribers to return (1-100, default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    {
      title: "List subscribers",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.subscribers.get({
          limit: params.limit,
          cursor: params.cursor,
        });
        return json(result);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "get-subscriber-count",
    "Get total subscriber count for a publication",
    {
      publicationId: z.string().min(1).describe("Publication ID"),
    },
    {
      title: "Get subscriber count",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.subscribers.getCount({
          id: params.publicationId,
        });
        return json(result);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "add-subscriber",
    "Add a subscriber to your publication by email or wallet address. Requires API key.",
    {
      email: z.string().email().optional().describe("Subscriber email address"),
      wallet: z
        .string()
        .min(1)
        .optional()
        .describe("Subscriber Ethereum wallet address"),
    },
    {
      title: "Add subscriber",
      readOnlyHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    async (params) => {
      if (!params.email && !params.wallet) {
        return error("Provide at least one of email or wallet");
      }

      try {
        const api = getApi();
        const result = await api.subscribers.create(params);
        return json(result);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );
}
