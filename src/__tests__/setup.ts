import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { vi } from "vitest";
import { registerTools, type Toolset } from "../tools/index.js";

/** Stub API — just enough to not throw when tools call through. */
function noopApi() {
  const chainable = () => {
    const p = Promise.resolve({}) as Promise<unknown> & { single: () => Promise<unknown> };
    p.single = () => Promise.resolve({});
    return p;
  };
  const list = () => Promise.resolve({ items: [], pagination: {} });

  return {
    posts: { get: vi.fn(chainable), list: vi.fn(list), create: vi.fn(list), update: vi.fn(list), delete: vi.fn(list), sendTestEmail: vi.fn(list) },
    publications: { get: vi.fn(chainable) },
    subscribers: { get: vi.fn(list), getCount: vi.fn(list), create: vi.fn(list) },
    users: { get: vi.fn(chainable) },
    coins: { get: vi.fn(chainable), getHolders: vi.fn(list) },
    search: { posts: vi.fn(list), blogs: vi.fn(list), coins: vi.fn(list) },
    feed: { get: vi.fn(list) },
    me: { get: vi.fn(list) },
  };
}

/**
 * Creates a connected MCP client+server pair with a stubbed API.
 */
export async function createTestClient(toolsets?: Toolset[]) {
  const server = new McpServer({ name: "Paragraph", version: "0.1.0" });
  registerTools(server, () => noopApi() as never, toolsets);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client };
}
