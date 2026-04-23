import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { analyticsQueryBody } from "@paragraph-com/sdk/zod";
import { json, toError } from "./helpers.js";

const ANALYTICS_QUERY_DESCRIPTION = `
Run a read-only SQL query against the authenticated publication's analytics schema.
Scoped automatically to the blog identified by the API key — do not include blog_id
filters in the WHERE clause.

**When to use this tool:** questions about newsletter open rates, click-through
rates, subscriber counts, unsubscribe rates, post views, unique visitors, read
time, engagement scores, top-performing posts, campaign attribution (UTMs,
referrers), or any quantitative metric about the publication. Triggers include
"how many subscribers", "what's my open rate", "which post performed best",
"traffic sources", "analytics for", "stats on", "report on".

**Query rules:**
- \`SELECT\` and \`WITH\` (CTE) statements only
- Reference tables unprefixed (e.g. \`FROM posts\`) — the analytics schema is
  the default search_path
- No semicolons, writes, DDL, or superuser functions
- Max SQL length 10,000 characters
- Hard 10,000-row cap; excess rows are truncated and \`truncated: true\` is
  returned
- 30-second statement timeout — prefer pre-aggregated views over raw tables
- Wrap UNIONs in a CTE (\`WITH ... SELECT ...\`)

**Prefer pre-aggregated views** (fast, sub-second):
- \`post_analytics_summary\` — one row per published post with \`open_rate\`,
  \`ctr\`, \`total_views\`, \`unique_viewers\`, \`avg_read_time\`,
  \`newsletter_sent\`, \`newsletter_unique_opens\`, \`newsletter_unique_clicks\`,
  \`newsletter_unsubscribes\`, \`top_countries\`. Use for any post-performance
  question.
- \`subscriber_engagement_scores\` — one row per subscriber with
  \`engagement_score\` (0-1), \`emails_received\`, \`emails_opened\`,
  \`total_clicks\`, \`last_engaged_at\`. Use for subscriber health or ranking.
- \`blog_subscriber_counts\` — single row with \`active_subscriber_count\`.

**Raw tables** (slower, may time out on large blogs):
- \`newsletter_metrics\` — subscriber × newsletter-send rows (\`send_status\`,
  \`open_count\`, \`click_count_total\`, \`sent_at\`, \`first_opened_at\`,
  \`is_unsubscribed\`).
- \`newsletter_link_clicks\` — link × subscriber × post (\`url\`,
  \`click_count\`).
- \`detailed_post_metrics\` — reader × post (\`view_count\`, \`country\`,
  \`read_time\`).
- \`post_views_daily\` — post × day (\`views\`, \`unique_visitors\`, \`day\`).
- \`posts\` and \`blogs\` — metadata for joining (share \`id\`, \`blog_id\`).

**Decision guide:**
| Question                      | Table                          |
| ----------------------------- | ------------------------------ |
| Open rate / CTR for a post    | post_analytics_summary         |
| Average open rate             | post_analytics_summary         |
| Top posts by views            | post_analytics_summary         |
| Subscriber count              | blog_subscriber_counts         |
| Most engaged subscribers      | subscriber_engagement_scores   |
| Inactive subscribers          | subscriber_engagement_scores   |
| Which links were clicked      | newsletter_link_clicks         |
| Daily view trend              | post_views_daily               |
| Reader countries              | detailed_post_metrics          |
| Specific subscriber's history | newsletter_metrics             |

**Examples:**
\`\`\`sql
-- Top 5 posts by views
SELECT title, total_views, open_rate
FROM post_analytics_summary
ORDER BY total_views DESC
LIMIT 5

-- Average open rate last 30 days
SELECT ROUND(AVG(open_rate)::numeric * 100, 1) AS avg_open_rate_pct
FROM post_analytics_summary
WHERE newsletter_sent > 0
  AND published_at > NOW() - INTERVAL '30 days'

-- Active subscriber count
SELECT active_subscriber_count FROM blog_subscriber_counts
\`\`\`

Call \`analytics-schema\` first if you need to discover columns beyond those
listed above.
`.trim();

const ANALYTICS_SCHEMA_DESCRIPTION = `
Returns column metadata for every table and view in the authenticated
publication's analytics schema: \`table_name\`, \`column_name\`, \`data_type\`,
\`is_nullable\`.

Use this before \`analytics-query\` when you need to discover tables or columns
that are not covered by the reference baked into the \`analytics-query\`
description, or to confirm a column type before writing a query.
`.trim();

export function registerAnalyticsTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "analytics-query",
    ANALYTICS_QUERY_DESCRIPTION,
    {
      sql: analyticsQueryBody.shape.sql,
    },
    {
      title: "Run an analytics SQL query",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.analytics.query({ sql: params.sql });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.tool(
    "analytics-schema",
    ANALYTICS_SCHEMA_DESCRIPTION,
    {},
    {
      title: "Describe the analytics schema",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const api = getApi();
        const result = await api.analytics.schema();
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
