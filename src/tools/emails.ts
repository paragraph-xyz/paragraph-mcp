import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { sendCustomEmailBody } from "@paragraph-com/sdk/zod";
import { json, toError } from "./helpers.js";

const SEND_CUSTOM_EMAIL_DESCRIPTION = `
Send a one-off markdown email from your authenticated publication to a specific list of recipient addresses you supply. Each recipient gets the email individually with a mandatory unsubscribe footer.

**Use this tool for:**
- **Targeted segment sends** to a specific subset of subscribers the agent identifies — e.g. "email everyone who opened my last post", "send a follow-up to my 50 most engaged subscribers", "reach out to this manually curated list of 20 readers".
- **Self-notifications to the writer** about their own publication — e.g. "email me when I hit 1,000 subscribers", "send me a weekly digest of my analytics", "notify me whenever a post crosses 10,000 views". The writer's own email address goes in \`emails\`; pair with \`get-me\` if you need to look it up.
- **Outreach to addresses that are not Paragraph subscribers** — e.g. a CSV of conference contacts, a press list, an intro to friends-of-friends, "email these 30 people about my AMA next Tuesday". Recipients can come from anywhere; they don't have to be in \`list-subscribers\`. (Anyone who previously unsubscribed from this publication will still come back as \`suppressed\`.)
- **Re-engagement of inactive subscribers** — e.g. "email everyone who hasn't opened in 90 days." Identify the segment via \`analytics-query\` against \`subscriber_engagement_scores\` or \`newsletter_metrics\`.
- **Draft review to a small set of collaborators** — e.g. "send this draft pitch to my 3 co-authors for feedback." Use this when you need to email people other than the publication owner; \`send-test-email\` only goes to the owner.

**Do NOT use this tool to send a post as a newsletter.** That's a different pipeline: call \`create-post\` or \`update-post\` with \`sendNewsletter: true\`, which mails all subscribers using the post template. \`send-custom-email\` only sends the subject and body you pass in, to the exact recipient list you pass in — it does not pull from the subscriber list automatically and does not render a post.

**Typical workflow:**
1. **Build the recipient list with the user.** Use \`analytics-query\` to find a segment (e.g. subscribers who opened a specific post via \`newsletter_metrics\`, or top-engaged readers via \`subscriber_engagement_scores\`), or \`list-subscribers\` for the full list. Confirm the segment with the user before drafting.
2. **Draft the subject and markdown body with the user.** Do not call this tool without explicit user approval of both the recipient list and the content — emails go out for real and cannot be undone.
3. **Optionally preview with \`dryRun: true\`** when the list is large or unfamiliar — returns the accepted/skipped split without sending.
4. **Send**, then report results back.

**Eligibility:** the publication must be approved by Paragraph for custom email. A 403 means the publication is not eligible — surface this to the user as "this publication isn't approved for custom email yet" and stop. Do not retry.

**Per-recipient filtering (server side):**
- Malformed addresses are returned in \`skipped\` with \`reason: "invalid"\`.
- Recipients who previously unsubscribed from this publication are returned with \`reason: "suppressed"\`.
- Recipients that pass filtering but fail to enqueue come back as \`reason: "scheduling_failed"\` — these are the only ones safe to retry.

**Caps:** up to 10,000 recipients per call.

**After sending:** report \`accepted\` (queued for delivery) and any \`skipped\` recipients with their reasons back to the user. Do not silently re-send rejected addresses.
`.trim();

export function registerEmailTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "send-custom-email",
    {
      title: "Send a custom email",
      description: SEND_CUSTOM_EMAIL_DESCRIPTION,
      inputSchema: {
        subject: sendCustomEmailBody.shape.subject.describe(
          "Subject line of the email (1–998 characters)."
        ),
        body: sendCustomEmailBody.shape.body.describe(
          "Email body in markdown. Rendered to HTML server-side. Max 100KB."
        ),
        emails: sendCustomEmailBody.shape.emails.describe(
          "Recipient email addresses. Up to 10,000. Malformed addresses are returned in `skipped` rather than rejecting the whole request."
        ),
        dryRun: sendCustomEmailBody.shape.dryRun.describe(
          "If true, run filtering and return the accepted/skipped split without scheduling delivery."
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.emails.send({
          subject: params.subject,
          body: params.body,
          emails: params.emails,
          ...(params.dryRun !== undefined ? { dryRun: params.dryRun } : {}),
        });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
