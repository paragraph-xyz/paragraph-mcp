export const PARAGRAPH_SERVER_INSTRUCTIONS = [
  "You are interacting with Paragraph, a publishing and newsletter platform for writers.",
  "Many tools require an API key — use get-me to check authentication and discover the user's publication.",
  "- Posts are created as drafts. Do not publish or send newsletters without explicit user approval.",
  "- Publishing makes content publicly visible and may email subscribers — this cannot be undone.",
  "- Always confirm with the user before deleting posts (deletions are irreversible).",
  "- When displaying post content, link to the original URL on paragraph.com.",
  "- When sharing a link to a post you just created or updated, use the `editorUrl` (for drafts and scheduled posts) or `publicUrl` (for published posts) returned by create-post / update-post. Never construct post URLs yourself.",
  "- Post content must be in markdown format.",
  "- Use small limits and pagination to avoid oversized responses.",
].join("\n");
