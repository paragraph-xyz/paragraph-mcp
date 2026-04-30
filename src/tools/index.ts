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
import { registerAnalyticsTools } from "./analytics.js";
import { registerEmailTools } from "./emails.js";

export type Toolset =
  | "posts"
  | "publications"
  | "subscribers"
  | "users"
  | "coins"
  | "search"
  | "feed"
  | "me"
  | "analytics"
  | "emails";

export const ALL_TOOLSETS: Toolset[] = [
  "posts",
  "publications",
  "subscribers",
  "users",
  "coins",
  "search",
  "feed",
  "me",
  "analytics",
  "emails",
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
  analytics: registerAnalyticsTools,
  emails: registerEmailTools,
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
