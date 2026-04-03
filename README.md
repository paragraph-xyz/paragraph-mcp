# @paragraph-com/mcp

MCP (Model Context Protocol) server for [Paragraph](https://paragraph.com) — expose your publication to AI agents in Claude Desktop, Cursor, VS Code Copilot, and any MCP-compatible client.

## Remote server (recommended)

Use the hosted server at `mcp.paragraph.com` — no installation or API key management required. You'll authenticate through your Paragraph account in the browser.

### Claude Code

```bash
claude mcp add paragraph --transport http https://mcp.paragraph.com/mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paragraph": {
      "url": "https://mcp.paragraph.com/mcp"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "paragraph": {
      "url": "https://mcp.paragraph.com/mcp"
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "paragraph": {
      "url": "https://mcp.paragraph.com/mcp"
    }
  }
}
```

## Local server

If you prefer to run the server locally, you can use npx. Requires Node.js 18+.

```bash
npx @paragraph-com/mcp
```

### Authentication (local only)

The remote server handles auth automatically. For local usage, set your API key via environment variable:

```bash
PARAGRAPH_API_KEY=your-key npx @paragraph-com/mcp
```

Or log in with the [Paragraph CLI](https://github.com/paragraph-xyz/paragraph-cli) — the MCP server shares the same config:

```bash
npx @paragraph-com/cli login
npx @paragraph-com/mcp
```

### Local setup by client

<details>
<summary>Claude Code</summary>

```bash
claude mcp add paragraph -- npx @paragraph-com/mcp
```
</details>

<details>
<summary>Claude Desktop</summary>

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paragraph": {
      "command": "npx",
      "args": ["@paragraph-com/mcp"],
      "env": {
        "PARAGRAPH_API_KEY": "your-key"
      }
    }
  }
}
```
</details>

<details>
<summary>Cursor / VS Code</summary>

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "paragraph": {
      "command": "npx",
      "args": ["@paragraph-com/mcp"],
      "env": {
        "PARAGRAPH_API_KEY": "your-key"
      }
    }
  }
}
```
</details>

### Streamable HTTP (local)

```bash
npx @paragraph-com/mcp --http --port 3100
```

> HTTP mode binds to `127.0.0.1` (localhost only) and accepts POST requests. A health check is available at `GET /health`.

## Available Tools

### Posts
- **get-post** — Get a post by ID or slugs
- **list-posts** — List posts from a publication or your own posts
- **create-post** — Create a new post (markdown)
- **update-post** — Update an existing post
- **delete-post** — Delete a post
- **send-test-email** — Send a test newsletter for a draft

### Publications
- **get-publication** — Get publication metadata by ID, slug, or domain

### Subscribers
- **list-subscribers** — List your subscribers
- **get-subscriber-count** — Get subscriber count
- **add-subscriber** — Add a subscriber by email or wallet

### Users
- **get-user** — Get user profile by ID or wallet

### Coins
- **get-coin** — Get coin metadata or list popular coins
- **list-coin-holders** — Get coin holders

### Search
- **search-posts** — Search posts
- **search-blogs** — Search publications
- **search-coins** — Search coins

### Feed
- **get-feed** — Get the curated platform feed

### Me
- **get-me** — Get your authenticated publication info

## Toolset Filtering

Only expose the tools your agent needs:

```bash
npx @paragraph-com/mcp --toolsets posts,search
```

Available toolsets: `posts`, `publications`, `subscribers`, `users`, `coins`, `search`, `feed`, `me`

## Examples

### Search and summarize posts on a topic

**Prompt:** "Search for posts about onchain governance and give me a summary of the top results"

The MCP server calls `search-posts` with the query. Claude receives the matching posts and synthesizes a summary of the key themes, authors, and publications.

### Draft and publish a blog post

**Prompt:** "Write a post titled 'Weekly Update #12' about our new token-gating feature, then publish it"

The server calls `create-post` with the title and generated markdown content, creating it as a draft. After you confirm, it calls `update-post` to set the status to `published`, making it live on your publication.

### Get subscriber analytics

**Prompt:** "How many subscribers does my publication have? Show me the most recent ones."

The server calls `get-me` to identify your publication, then `get-subscriber-count` for the total, and `list-subscribers` to return the latest subscribers with their details.

### Explore the platform feed

**Prompt:** "What's trending on Paragraph right now?"

The server calls `get-feed` to retrieve the curated platform feed and Claude summarizes the top posts, their authors, and topics.

### Manage post lifecycle

**Prompt:** "Show me my drafts and send a test email for the most recent one"

The server calls `list-posts` with `status: draft` to retrieve your drafts, then `send-test-email` with the latest draft's ID so you can preview the newsletter in your inbox before sending it to subscribers.

## Support

- **Issues & bugs:** [GitHub Issues](https://github.com/paragraph-xyz/paragraph-mcp/issues)
- **Email:** support@paragraph.com
- **Website:** [paragraph.com](https://paragraph.com)

## Releasing

```bash
npm run release patch   # 1.0.0 → 1.0.1
npm run release minor   # 1.0.0 → 1.1.0
npm run release major   # 1.0.0 → 2.0.0
```

Builds, tests, publishes to npm, deploys the Cloudflare Worker at `mcp.paragraph.com`, and creates a GitHub release. The script will prompt for any missing credentials.

## Privacy Policy

This MCP server connects to the [Paragraph](https://paragraph.com) API on your behalf. See the [Paragraph Privacy Policy](https://paragraph.com/privacy) for details on data collection, usage, storage, and your rights.

## License

MIT
