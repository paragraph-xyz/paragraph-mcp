import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  getCoinParams,
  getCoinByContractPathContractAddressRegExp,
  getCoinHoldersByIdParams,
  getCoinHoldersByIdQueryParams,
  getCoinHoldersByContractParams,
} from "@paragraph-com/sdk/zod";
import { error, json, toError } from "./helpers.js";

export function registerCoinTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "get-coin",
    {
      title: "Get coin",
      description:
        "Get coin/token metadata by ID or contract address, or list popular coins. Provide exactly one of id, contractAddress, or popular=true, and omit the other fields. Empty strings are treated as omitted.",
      inputSchema: {
        id: getCoinParams.shape.id.optional().describe("Coin ID"),
        // Accepts "" (treated as omitted) and validates the address in the
        // handler. See get-publication's slug for why this isn't
        // `.or(z.literal(""))`.
        contractAddress: z
          .string()
          .optional()
          .describe("On-chain contract address (0x followed by 40 hex characters)"),
        popular: z
          .boolean()
          .optional()
          .describe("Set to true to get popular coins"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const hasId = !!params.id;
      const hasContract = !!params.contractAddress;
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
      if (
        hasContract &&
        !getCoinByContractPathContractAddressRegExp.test(params.contractAddress!)
      ) {
        return error("contractAddress must be 0x followed by 40 hex characters");
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
        return toError(err);
      }
    }
  );

  server.registerTool(
    "list-coin-holders",
    {
      title: "List coin holders",
      description:
        "Get a paginated list of holders for a coin by ID or contract address",
      inputSchema: {
        id: getCoinHoldersByIdParams.shape.id.optional().describe("Coin ID"),
        contractAddress: getCoinHoldersByContractParams.shape.contractAddress
          .optional()
          .describe("On-chain contract address"),
        limit: getCoinHoldersByIdQueryParams.shape.limit.describe(
          "Number of holders to return. Keep this small to avoid oversized responses — use pagination to retrieve more."
        ),
        cursor: getCoinHoldersByIdQueryParams.shape.cursor,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
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
        return toError(err);
      }
    }
  );
}
