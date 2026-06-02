import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ParagraphAPI } from "@paragraph-com/sdk";
import { registerPostTools } from "../tools/posts.js";

/**
 * Spins up an MCP client/server pair wired to a stub API that records every
 * `posts.update` call, so we can assert which identifier the handler resolved
 * the post by. Enrichment (buildPostUrls) is satisfied by the same stub.
 */
async function setup() {
  const updateCalls: Array<Record<string, unknown>> = [];
  const post = { id: "p_1", slug: "hello-world", status: "draft" as const };

  const chainable = (result: unknown) => ({ single: () => Promise.resolve(result) });
  const api = {
    posts: {
      update: vi.fn((args: Record<string, unknown>) => {
        updateCalls.push(args);
        return Promise.resolve({ ...post });
      }),
      get: vi.fn(() => chainable(post)),
    },
    me: {
      get: vi.fn(() =>
        Promise.resolve({ id: "pub_1", name: "Blog", ownerUserId: "u_1", slug: "blog" })
      ),
    },
  } as unknown as ParagraphAPI;

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerPostTools(server, () => api);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, updateCalls };
}

describe("update-post identifier handling", () => {
  let client: Client | undefined;
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("id only -> resolves by id", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", title: "New title" },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.updateCalls).toHaveLength(1);
    expect(ctx.updateCalls[0]).toEqual({ id: "p_1", title: "New title" });
  });

  it("slug only -> resolves by slug", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { slug: "hello-world", title: "New title" },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.updateCalls).toHaveLength(1);
    expect(ctx.updateCalls[0]).toEqual({ slug: "hello-world", title: "New title" });
  });

  it("both id and slug -> resolves by id, ignores slug, does NOT error", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", slug: "hello-world", title: "New title" },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.updateCalls).toHaveLength(1);
    // id is used; slug is not forwarded to the API at all.
    expect(ctx.updateCalls[0]).toEqual({ id: "p_1", title: "New title" });
    expect(ctx.updateCalls[0]).not.toHaveProperty("slug");
  });

  it("neither id nor slug -> errors asking for one of them", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { title: "New title" },
    });

    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Provide id or slug");
    expect(ctx.updateCalls).toHaveLength(0);
  });

  it("both id and slug with newSlug -> renames by id, does NOT error", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", slug: "hello-world", newSlug: "renamed" },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.updateCalls).toHaveLength(1);
    expect(ctx.updateCalls[0]).toEqual({ id: "p_1", slug: "renamed" });
  });

  it("slug + newSlug (no id) -> still errors (cannot rename by slug)", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { slug: "hello-world", newSlug: "renamed" },
    });

    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Identify the post by id instead");
    expect(ctx.updateCalls).toHaveLength(0);
  });
});
