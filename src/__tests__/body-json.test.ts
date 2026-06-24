import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ParagraphAPI } from "@paragraph-com/sdk";
import { registerPostTools } from "../tools/posts.js";

const DOC_WITH_BUTTON = JSON.stringify({
  type: "doc",
  content: [
    {
      type: "subscribeButton",
    },
  ],
});

const DOC_PLAIN = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
});

/**
 * Wires an MCP client/server pair to a stub API and lets each test control the
 * stored post (its `json`/`staticHtml`) while recording create/update/get calls.
 */
async function setup(postOverrides: Record<string, unknown> = {}) {
  const updateCalls: Array<Record<string, unknown>> = [];
  const createCalls: Array<Record<string, unknown>> = [];
  const post = {
    id: "p_1",
    slug: "hello-world",
    status: "draft" as const,
    json: DOC_PLAIN,
    staticHtml: "<p>hi</p>",
    ...postOverrides,
  };

  const chainable = (result: unknown) => ({
    single: () => Promise.resolve(result),
  });
  const api = {
    posts: {
      update: vi.fn((args: Record<string, unknown>) => {
        updateCalls.push(args);
        return Promise.resolve({ ...post });
      }),
      create: vi.fn((args: Record<string, unknown>) => {
        createCalls.push(args);
        return Promise.resolve({ id: "p_1", status: "draft" });
      }),
      get: vi.fn(() => chainable(post)),
    },
    me: {
      get: vi.fn(() =>
        Promise.resolve({
          id: "pub_1",
          name: "Blog",
          ownerUserId: "u_1",
          slug: "blog",
        })
      ),
    },
  } as unknown as ParagraphAPI;

  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerPostTools(server, () => api);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, updateCalls, createCalls };
}

function textOf(res: unknown): string {
  return (res as { content: Array<{ text: string }> }).content[0].text;
}

describe("bodyJson on update-post / create-post (PAR-9429)", () => {
  let client: Client | undefined;
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("update-post forwards bodyJson to the API", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", bodyJson: DOC_WITH_BUTTON },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.updateCalls).toHaveLength(1);
    expect(ctx.updateCalls[0]).toEqual({ id: "p_1", bodyJson: DOC_WITH_BUTTON });
  });

  it("update-post rejects markdown + bodyJson together, no API call", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", markdown: "# hi", bodyJson: DOC_PLAIN },
    });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("not both");
    expect(ctx.updateCalls).toHaveLength(0);
  });

  it("Guard B: markdown overwrite of a button-bearing post is blocked", async () => {
    const ctx = await setup({ json: DOC_WITH_BUTTON });
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", markdown: "# rewritten" },
    });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("bodyJson");
    expect(ctx.updateCalls).toHaveLength(0);
  });

  it("Guard B: markdown update of a button-free post proceeds", async () => {
    const ctx = await setup({ json: DOC_PLAIN });
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", markdown: "# rewritten" },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.updateCalls).toHaveLength(1);
    expect(ctx.updateCalls[0]).toEqual({ id: "p_1", markdown: "# rewritten" });
  });

  it("get-post returns the Tiptap json, strips staticHtml", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "get-post",
      arguments: { id: "p_1" },
    });

    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(textOf(res));
    expect(parsed.json).toBe(DOC_PLAIN);
    expect(parsed).not.toHaveProperty("staticHtml");
  });

  it("create-post forwards bodyJson to the API", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "create-post",
      arguments: { title: "T", bodyJson: DOC_WITH_BUTTON },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.createCalls).toHaveLength(1);
    expect(ctx.createCalls[0]).toMatchObject({
      title: "T",
      bodyJson: DOC_WITH_BUTTON,
    });
  });

  it("create-post rejects markdown + bodyJson together", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "create-post",
      arguments: { title: "T", markdown: "# hi", bodyJson: DOC_PLAIN },
    });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("not both");
    expect(ctx.createCalls).toHaveLength(0);
  });

  it("create-post requires markdown or bodyJson", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "create-post",
      arguments: { title: "T" },
    });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("markdown or bodyJson");
    expect(ctx.createCalls).toHaveLength(0);
  });
});
