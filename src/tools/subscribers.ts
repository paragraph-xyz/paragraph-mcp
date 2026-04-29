import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI, ParagraphApiError } from "@paragraph-com/sdk";
import {
  listSubscribersQueryParams,
  getSubscriberCountParams,
  addSubscriberBody,
  removeSubscriberBody,
} from "@paragraph-com/sdk/zod";
import { error, json, toError } from "./helpers.js";

export function registerSubscriberTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "list-subscribers",
    {
      title: "List subscribers",
      description:
        "List subscribers for your publication with pagination. Requires API key.",
      inputSchema: {
        limit: listSubscribersQueryParams.shape.limit.describe(
          "Number of subscribers to return (1-100, default: 10). Keep this small to avoid oversized responses — use pagination to retrieve more."
        ),
        cursor: listSubscribersQueryParams.shape.cursor,
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
        const result = await api.subscribers.get({
          limit: params.limit,
          cursor: params.cursor,
        });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "get-subscriber-count",
    {
      title: "Get subscriber count",
      description: "Get total subscriber count for a publication",
      inputSchema: {
        publicationId: getSubscriberCountParams.shape.publicationId,
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
        try {
          await api.publications.get({ id: params.publicationId }).single();
        } catch (err) {
          if (err instanceof ParagraphApiError && err.status === 404) {
            return error(
              `Invalid publication ID "${params.publicationId}". Call \`get-me\` to obtain the authenticated publication's ID, or use \`search-blogs\` to look one up by name or slug.`
            );
          }
          throw err;
        }
        const result = await api.subscribers.getCount({
          id: params.publicationId,
        });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "add-subscriber",
    {
      title: "Add subscriber",
      description:
        "Add a subscriber to your publication by email or wallet address. Requires API key.",
      inputSchema: {
        email: addSubscriberBody.shape.email,
        wallet: addSubscriberBody.shape.wallet,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
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
        return toError(err);
      }
    }
  );

  server.registerTool(
    "remove-subscriber",
    {
      title: "Remove subscriber",
      description:
        "Remove a subscriber from your publication by email or wallet address. This is a hard delete and cannot be undone — always confirm with the user before calling. Tip: call `list-subscribers` first to confirm the subscriber exists. If both email and wallet are provided, they must resolve to the same user. Requires API key.",
      inputSchema: {
        email: removeSubscriberBody.shape.email,
        wallet: removeSubscriberBody.shape.wallet,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      if (!params.email && !params.wallet) {
        return error("Provide at least one of email or wallet");
      }

      try {
        const api = getApi();
        const result = await api.subscribers.remove(params);
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
