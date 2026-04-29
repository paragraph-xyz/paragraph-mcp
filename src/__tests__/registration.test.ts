import { describe, it, expect, afterEach } from "vitest";
import { createTestClient } from "./setup.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const ALL_TOOL_NAMES = [
  "get-post", "list-posts", "create-post", "update-post", "delete-post", "send-test-email",
  "get-publication", "update-publication",
  "list-subscribers", "get-subscriber-count", "add-subscriber", "remove-subscriber",
  "get-user",
  "get-coin", "list-coin-holders",
  "search-posts", "search-blogs", "search-coins",
  "get-feed",
  "get-me",
  "analytics-query", "analytics-schema",
];

describe("tool registration", () => {
  let client: Client;
  afterEach(async () => { await client?.close(); });

  it("registers all 22 tools", async () => {
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

  it("every tool has a description", async () => {
    ({ client } = await createTestClient());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} missing description`).toBeTruthy();
    }
  });
});
