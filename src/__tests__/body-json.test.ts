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
    expect(ctx.updateCalls[0]).toEqual({
      id: "p_1",
      bodyJson: DOC_WITH_BUTTON,
    });
  });

  it("update-post does not advertise a markdown param (PAR-9923)", async () => {
    const ctx = await setup();
    client = ctx.client;

    const { tools } = await client.listTools();
    const update = tools.find((t) => t.name === "update-post");

    expect(update).toBeDefined();
    expect(update?.inputSchema.properties).toHaveProperty("bodyJson");
    expect(update?.inputSchema.properties).not.toHaveProperty("markdown");
  });

  it("update-post never forwards markdown to the API (PAR-9923)", async () => {
    const ctx = await setup({ json: DOC_WITH_BUTTON });
    client = ctx.client;

    const res = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", title: "T", markdown: "# rewritten" },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.updateCalls).toHaveLength(1);
    expect(ctx.updateCalls[0]).toEqual({ id: "p_1", title: "T" });
  });

  it("update-post errors rather than silently no-op'ing a markdown-only edit", async () => {
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

  it("advertises and forwards cover alt text when creating a draft", async () => {
    const ctx = await setup();
    client = ctx.client;
    const { tools } = await client.listTools();
    for (const name of ["create-post", "update-post"]) {
      expect(
        tools.find((tool) => tool.name === name)?.inputSchema.properties
      ).toHaveProperty("imageAlt");
    }

    const res = await client.callTool({
      name: "create-post",
      arguments: {
        title: "Cover QA",
        bodyJson: DOC_WITH_BUTTON,
        imageUrl: "https://example.com/cover.png",
        imageAlt: "A blue circle on white.",
      },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.createCalls).toEqual([
      expect.objectContaining({
        bodyJson: DOC_WITH_BUTTON,
        imageUrl: "https://example.com/cover.png",
        imageAlt: "A blue circle on white.",
      }),
    ]);
  });

  it.each(["A red circle on white.", null])(
    "updates or clears only cover alt text (%j)",
    async (imageAlt) => {
      const ctx = await setup({ json: DOC_WITH_BUTTON });
      client = ctx.client;
      const res = await client.callTool({
        name: "update-post",
        arguments: { id: "p_1", imageAlt },
      });

      expect(res.isError).toBeFalsy();
      expect(ctx.updateCalls).toEqual([{ id: "p_1", imageAlt }]);
      expect(ctx.createCalls).toHaveLength(0);
    }
  );

  it("ignores blank alt placeholders during body edits and refuses blank-only edits", async () => {
    const ctx = await setup({
      json: DOC_WITH_BUTTON,
      imageAlt: "Keep the existing accessible description.",
    });
    client = ctx.client;
    const changed = await client.callTool({
      name: "update-post",
      arguments: {
        id: "p_1",
        title: "Updated title",
        bodyJson: DOC_WITH_BUTTON,
        imageAlt: "",
      },
    });
    expect(changed.isError).toBeFalsy();
    expect(ctx.updateCalls).toEqual([
      { id: "p_1", title: "Updated title", bodyJson: DOC_WITH_BUTTON },
    ]);

    const blankOnly = await client.callTool({
      name: "update-post",
      arguments: { id: "p_1", imageAlt: "" },
    });
    expect(blankOnly.isError).toBe(true);
    expect(ctx.updateCalls).toHaveLength(1);
  });

  it("rejects oversized cover alt text before any API write", async () => {
    const ctx = await setup();
    client = ctx.client;
    for (const [name, args] of [
      ["create-post", { title: "QA", bodyJson: DOC_PLAIN }],
      ["update-post", { id: "p_1" }],
    ] as const) {
      const res = await client.callTool({
        name,
        arguments: { ...args, imageAlt: "x".repeat(1001) },
      });
      expect(res.isError).toBe(true);
    }
    expect(ctx.createCalls).toHaveLength(0);
    expect(ctx.updateCalls).toHaveLength(0);
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

  it("create-post ignores a blank markdown sent alongside bodyJson", async () => {
    const ctx = await setup();
    client = ctx.client;

    const res = await client.callTool({
      name: "create-post",
      arguments: {
        title: "T",
        markdown: "",
        bodyJson: DOC_PLAIN,
        subtitle: "",
      },
    });

    expect(res.isError).toBeFalsy();
    expect(ctx.createCalls[0]).toEqual({
      title: "T",
      bodyJson: DOC_PLAIN,
      status: "draft",
    });
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
