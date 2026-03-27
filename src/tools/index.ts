import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { registerPublicationTools } from "./publications.js";
import { registerPostTools } from "./posts.js";
import { registerSubscriberTools } from "./subscribers.js";
import { registerUserTools } from "./users.js";
import { registerCoinTools } from "./coins.js";
import { registerSearchTools } from "./search.js";
import { registerFeedTools } from "./feed.js";
import { registerMeTools } from "./me.js";

export type Toolset =
  | "posts"
  | "publications"
  | "subscribers"
  | "users"
  | "coins"
  | "search"
  | "feed"
  | "me";

export const ALL_TOOLSETS: Toolset[] = [
  "posts",
  "publications",
  "subscribers",
  "users",
  "coins",
  "search",
  "feed",
  "me",
];

const toolsetRegistrars: Record<
  Toolset,
  (server: McpServer, getApi: () => ParagraphAPI) => void
> = {
  publications: registerPublicationTools,
  posts: registerPostTools,
  subscribers: registerSubscriberTools,
  users: registerUserTools,
  coins: registerCoinTools,
  search: registerSearchTools,
  feed: registerFeedTools,
  me: registerMeTools,
};

export function registerTools(
  server: McpServer,
  getApi: () => ParagraphAPI,
  toolsets?: Toolset[]
) {
  const active = toolsets && toolsets.length > 0 ? toolsets : ALL_TOOLSETS;

  for (const toolset of active) {
    const register = toolsetRegistrars[toolset];
    if (register) {
      register(server, getApi);
    }
  }
}
