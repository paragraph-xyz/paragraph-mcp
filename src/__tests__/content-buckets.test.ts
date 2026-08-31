import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ParagraphAPI } from "@paragraph-com/sdk";
import { registerContentTools } from "../tools/content.js";
import { registerBucketTools } from "../tools/buckets.js";

const BUCKET_ID = "c4e1a9d2-30b7-4f68-8a15-2d9c6b0e7f43";

/**
 * An MCP client/server pair wired to a stub API that records every content and
 * bucket call.
 *
 * What these pin is the whole point of PAR-10689: a tool argument that isn't
 * declared in `inputSchema` is stripped by the MCP SDK before the handler ever
 * sees it, and a handler that doesn't forward a declared argument drops it just
 * as silently. Either way the caller gets a 200 and no grouping — the failure
 * the public API used to have, moved one layer up.
 */
async function setup() {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const record = (tool: string) =>
    vi.fn((args: Record<string, unknown> = {}) => {
      calls.push({ tool, args });
      return Promise.resolve({ id: "content-1", bucketId: BUCKET_ID });
    });

  const api = {
    content: { create: record("create"), update: record("update") },
    buckets: {
      list: record("list"),
      get: record("get"),
      forPost: record("forPost"),
      createForPost: record("createForPost"),
    },
  } as unknown as ParagraphAPI;

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerContentTools(server, () => api);
  registerBucketTools(server, () => api);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, calls };
}

describe("content grouping reaches the API", () => {
  let client: Client | undefined;
  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("forwards bucketId from create-content", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "create-content",
      arguments: {
        kind: "tweet",
        title: "Thread",
        body: { tweets: ["First."] },
        bucketId: BUCKET_ID,
      },
    });

    expect(ctx.calls).toHaveLength(1);
    expect(ctx.calls[0].args).toMatchObject({ bucketId: BUCKET_ID });
  });

  it("forwards bucketId from update-content", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "update-content",
      arguments: { contentId: "content-1", bucketId: BUCKET_ID },
    });

    expect(ctx.calls[0].args).toMatchObject({
      id: "content-1",
      bucketId: BUCKET_ID,
    });
  });

  it("omits bucketId from update-content when it wasn't asked for", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "update-content",
      arguments: { contentId: "content-1", title: "Renamed" },
    });

    // Sending `bucketId: undefined` would be a different request than sending
    // nothing once the body is serialized.
    expect(ctx.calls[0].args).not.toHaveProperty("bucketId");
  });

  it("seeds a post's group by id", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "create-post-content-bucket",
      arguments: { postId: "post-1" },
    });

    expect(ctx.calls[0]).toMatchObject({
      tool: "createForPost",
      args: { postId: "post-1" },
    });
  });

  it("reads a group by id, and a post's group by post id", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "get-content-bucket",
      arguments: { bucketId: BUCKET_ID },
    });
    await client.callTool({
      name: "get-post-content-bucket",
      arguments: { postId: "post-1" },
    });

    expect(ctx.calls).toEqual([
      { tool: "get", args: { id: BUCKET_ID } },
      { tool: "forPost", args: { postId: "post-1" } },
    ]);
  });
});
