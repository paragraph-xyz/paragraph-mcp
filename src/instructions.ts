export const PARAGRAPH_SERVER_INSTRUCTIONS = [
  "You are interacting with Paragraph, a publishing and newsletter platform for writers.",
  "Many tools require an API key — use get-me to check authentication and discover the user's publication.",
  "- Posts are created as drafts. Do not publish or send newsletters without explicit user approval.",
  "- Publishing makes content publicly visible and may email subscribers — this cannot be undone.",
  "- Always confirm with the user before deleting posts (deletions are irreversible).",
  "- When displaying post content, link to the original URL on paragraph.com.",
  "- When sharing a link to a post you just created or updated, use the `editorUrl` (for drafts and scheduled posts) or `publicUrl` (for published posts) returned by create-post / update-post. Never construct post URLs yourself.",
  "- A post body is a rich Tiptap document, not markdown. Changing an existing post's body is bodyJson-only: call get-post to read its `json`, edit that document, and send the whole thing back via update-post's `bodyJson`, so the post's links, embeds, and buttons survive the edit. Only create-post accepts `markdown`, and only for a brand-new post of plain prose.",
  "- send-custom-email is for one-off targeted sends. Common shapes: a subscriber segment (e.g. \"email people who opened my last post\"), a re-engagement / win-back to inactive subscribers, a self-notification to the writer (e.g. \"email me when I hit 1,000 subscribers\"), outreach to addresses that aren't Paragraph subscribers (e.g. a CSV of conference contacts), or a draft review to a few collaborators. It is NOT for newsletter blasts — to email all subscribers with a post, use create-post / update-post with `sendNewsletter: true`. Build the recipient list with the user (analytics-query or list-subscribers for segments; get-me for the writer's own email; external sources don't need a lookup), draft the subject and body, confirm before sending. On a 403, tell the user the publication isn't approved for custom email yet and stop. After a send, report the `accepted` count and any `skipped` recipients with their reasons; do not retry rejected addresses.",
  "- Use small limits and pagination to avoid oversized responses.",
].join("\n");
