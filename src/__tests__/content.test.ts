import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ParagraphAPI } from "@paragraph-com/sdk";
import { registerContentTools } from "../tools/content.js";

type Call = Record<string, unknown>;

async function setup() {
  const calls: Record<string, Call[]> = {
    create: [],
    list: [],
    get: [],
    update: [],
    archive: [],
    restore: [],
  };
  const piece = { id: "c_1", kind: "tweet", title: "Draft", status: "draft" };

  const record = (name: string, result: unknown) => (args: Call) => {
    calls[name].push(args);
    return Promise.resolve(result);
  };

  const api = {
    content: {
      create: vi.fn(record("create", piece)),
      list: vi.fn(record("list", { items: [piece], pagination: { hasMore: false } })),
      get: vi.fn(record("get", { ...piece, body: { text: "hi" } })),
      update: vi.fn(record("update", piece)),
      archive: vi.fn(record("archive", { ...piece, archivedAt: "2026-08-19T00:00:00Z" })),
      restore: vi.fn(record("restore", { ...piece, archivedAt: null })),
    },
  } as unknown as ParagraphAPI;

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerContentTools(server, () => api);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, calls };
}

describe("content tools", () => {
  let client: Client | undefined;
  afterEach(async () => { await client?.close(); client = undefined; });

  it("create-content forwards kind, title, and body", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "create-content",
      arguments: {
        kind: "tweet",
        title: "Thread on writing in public",
        body: { tweets: ["One.", "Two."] },
      },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.calls.create).toEqual([
      {
        kind: "tweet",
        title: "Thread on writing in public",
        body: { tweets: ["One.", "Two."] },
      },
    ]);
  });

  it("list-content forwards kind and status filters", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "list-content",
      arguments: { kind: "linkedin", status: "draft", limit: 5 },
    });

    expect(ctx.calls.list[0]).toMatchObject({
      kind: "linkedin",
      status: "draft",
      limit: 5,
    });
  });

  it("get-content passes contentId as the identifier", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "get-content",
      arguments: { contentId: "c_1" },
    });

    expect(ctx.calls.get).toEqual([{ id: "c_1" }]);
  });

  it("update-content sends only the fields provided", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "update-content",
      arguments: { contentId: "c_1", title: "Second pass" },
    });

    expect(ctx.calls.update).toEqual([{ id: "c_1", title: "Second pass" }]);
  });

  it("archive-content and restore-content pass the id", async () => {
    const ctx = await setup();
    client = ctx.client;

    await client.callTool({
      name: "archive-content",
      arguments: { contentId: "c_1" },
    });
    await client.callTool({
      name: "restore-content",
      arguments: { contentId: "c_1" },
    });

    expect(ctx.calls.archive).toEqual([{ id: "c_1" }]);
    expect(ctx.calls.restore).toEqual([{ id: "c_1" }]);
  });
});
