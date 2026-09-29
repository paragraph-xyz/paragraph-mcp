import { describe, it, expect, afterEach } from "vitest";
import { createTestClient } from "./setup.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const ALL_TOOL_NAMES = [
  "get-post", "list-posts", "create-post", "update-post", "delete-post", "send-test-email",
  "create-content", "list-content", "get-content", "update-content", "archive-content", "restore-content",
  "list-content-buckets", "get-content-bucket", "get-post-content-bucket", "create-post-content-bucket",
  "get-publication", "update-publication",
  "list-subscribers", "get-subscriber-count", "add-subscriber", "remove-subscriber",
  "get-user",
  "get-coin", "list-coin-holders",
  "search-posts", "search-blogs", "search-coins",
  "get-feed",
  "get-me",
  "analytics-query", "analytics-schema",
  "send-custom-email",
];

describe("tool registration", () => {
  let client: Client;
  afterEach(async () => { await client?.close(); });

  it("registers all 33 tools", async () => {
    ({ client } = await createTestClient());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("filters to only requested toolsets", async () => {
    ({ client } = await createTestClient(["search", "me"]));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "search-posts", "search-blogs", "search-coins", "get-me",
    ]);
  });

  // Gemini rejects an empty string in `enum` (and `const`, which clients
  // convert to a one-value enum) with a 400 that fails the whole request, not
  // just this tool. `.or(z.literal(""))` produces exactly that. Accept "" with
  // a plain string schema and treat it as omitted in the handler instead.
  it("no input schema allows only an empty string via enum or const", async () => {
    ({ client } = await createTestClient());
    const { tools } = await client.listTools();
    const offenders: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      if (node === null || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      if (record.const === "") offenders.push(`${path}.const`);
      if (Array.isArray(record.enum) && record.enum.includes("")) {
        offenders.push(`${path}.enum`);
      }
      for (const [key, value] of Object.entries(record)) {
        walk(value, `${path}.${key}`);
      }
    };
    for (const tool of tools) walk(tool.inputSchema, tool.name);
    expect(offenders).toEqual([]);
  });

  it("every tool has a description", async () => {
    ({ client } = await createTestClient());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} missing description`).toBeTruthy();
    }
  });
});
