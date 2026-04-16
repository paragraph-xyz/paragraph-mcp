import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ParagraphAPI,
  listSubscribersQueryParams,
  getSubscriberCountParams,
  addSubscriberBody,
} from "@paragraph-com/sdk";
import { error, json } from "./helpers.js";

export function registerSubscriberTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "list-subscribers",
    "List subscribers for your publication with pagination. Requires API key.",
    {
      limit: listSubscribersQueryParams.shape.limit.describe(
        "Number of subscribers to return (1-100, default: 10). Keep this small to avoid oversized responses — use pagination to retrieve more."
      ),
      cursor: listSubscribersQueryParams.shape.cursor,
    },
    {
      title: "List subscribers",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
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
      publicationId: getSubscriberCountParams.shape.publicationId,
    },
    {
      title: "Get subscriber count",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
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
      email: addSubscriberBody.shape.email,
      wallet: addSubscriberBody.shape.wallet,
    },
    {
      title: "Add subscriber",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
