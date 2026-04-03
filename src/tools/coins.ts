import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ParagraphAPI,
  getCoinParams,
  getCoinByContractParams,
  getCoinHoldersByIdParams,
  getCoinHoldersByIdQueryParams,
  getCoinHoldersByContractParams,
} from "@paragraph-com/sdk";
import { error, json } from "./helpers.js";

export function registerCoinTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "get-coin",
    "Get coin/token metadata by ID or contract address, or list popular coins",
    {
      id: getCoinParams.shape.id.optional().describe("Coin ID"),
      contractAddress: getCoinByContractParams.shape.contractAddress
        .optional()
        .describe("On-chain contract address"),
      popular: z
        .boolean()
        .optional()
        .describe("Set to true to get popular coins"),
    },
    {
      title: "Get coin",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async (params) => {
      const hasId = params.id !== undefined;
      const hasContract = params.contractAddress !== undefined;
      const hasPopular = params.popular === true;
      const count = [hasId, hasContract, hasPopular].filter(Boolean).length;

      if (count === 0) {
        return error(
          "Provide one of id, contractAddress, or set popular=true"
        );
      }
      if (count > 1) {
        return error("Provide only one of id, contractAddress, or popular");
      }

      try {
        const api = getApi();

        if (hasPopular) {
          const { items } = await api.coins.get({ sortBy: "popular" });
          return json(items);
        }
        if (hasId) {
          const coin = await api.coins.get({ id: params.id! }).single();
          return json(coin);
        }
        const coin = await api.coins
          .get({ contractAddress: params.contractAddress! })
          .single();
        return json(coin);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "list-coin-holders",
    "Get a paginated list of holders for a coin by ID or contract address",
    {
      id: getCoinHoldersByIdParams.shape.id.optional().describe("Coin ID"),
      contractAddress: getCoinHoldersByContractParams.shape.contractAddress
        .optional()
        .describe("On-chain contract address"),
      limit: getCoinHoldersByIdQueryParams.shape.limit.describe(
        "Number of holders to return. Keep this small to avoid oversized responses — use pagination to retrieve more."
      ),
      cursor: getCoinHoldersByIdQueryParams.shape.cursor,
    },
    {
      title: "List coin holders",
      readOnlyHint: true,
      openWorldHint: false,
    },
    async (params) => {
      if (params.id && params.contractAddress) {
        return error("Provide either id or contractAddress, not both");
      }
      if (!params.id && !params.contractAddress) {
        return error("Provide either id or contractAddress");
      }

      try {
        const api = getApi();
        const paginationParams = {
          limit: params.limit,
          cursor: params.cursor,
        };

        const result = params.id
          ? await api.coins.getHolders({ id: params.id }, paginationParams)
          : await api.coins.getHolders(
              { contractAddress: params.contractAddress! },
              paginationParams
            );
        return json(result);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );
}
