import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  getUserParams,
  getUserByWalletParams,
} from "@paragraph-com/sdk/zod";
import { error, json } from "./helpers.js";

export function registerUserTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "get-user",
    "Get user profile by ID or Ethereum wallet address",
    {
      id: getUserParams.shape.userId.optional().describe("User ID"),
      wallet: getUserByWalletParams.shape.walletAddress
        .optional()
        .describe("Ethereum wallet address (e.g. '0x1234...')"),
    },
    {
      title: "Get user",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      if (params.id && params.wallet) {
        return error("Provide either id or wallet, not both");
      }
      if (!params.id && !params.wallet) {
        return error("Provide either id or wallet");
      }

      try {
        const api = getApi();
        const user = params.id
          ? await api.users.get({ id: params.id }).single()
          : await api.users.get({ wallet: params.wallet! }).single();
        return json(user);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );
}
