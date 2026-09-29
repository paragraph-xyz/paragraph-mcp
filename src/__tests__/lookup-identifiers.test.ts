import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ParagraphAPI } from "@paragraph-com/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoinTools } from "../tools/coins.js";
import { registerPublicationTools } from "../tools/publications.js";

const publication = { id: "pub_1", slug: "my-publication" };
const coin = { id: "coin_1" };
const contractAddress = "0x1234567890123456789012345678901234567890";

async function setup() {
  const getPublication = vi.fn(() => ({
    single: async () => publication,
  }));
  const getCoin = vi.fn(() =>
    Object.assign(Promise.resolve({ items: [coin] }), {
      single: async () => coin,
    })
  );
  const api = {
    publications: { get: getPublication },
    coins: { get: getCoin },
  } as unknown as ParagraphAPI;
  const getApi = vi.fn(() => api);
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerPublicationTools(server, getApi);
  registerCoinTools(server, getApi);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, getApi, getPublication, getCoin };
}

describe("lookup identifiers", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(async () => {
    await ctx.client.close();
  });

  describe("get-publication", () => {
    it.each([
      { id: "pub_1" },
      { slug: "my-publication" },
      { domain: "example.com" },
    ])("resolves %j with omitted siblings", async (identifier) => {
      const result = await ctx.client.callTool({
        name: "get-publication",
        arguments: identifier,
      });

      expect(result.isError).toBeFalsy();
      expect(ctx.getPublication).toHaveBeenCalledExactlyOnceWith(identifier);
    });

    it.each([
      { id: "pub_1" },
      { slug: "my-publication" },
      { domain: "example.com" },
    ])("resolves %j with empty siblings", async (identifier) => {
      const result = await ctx.client.callTool({
        name: "get-publication",
        arguments: { id: "", slug: "", domain: "", ...identifier },
      });

      expect(result.isError).toBeFalsy();
      expect(ctx.getPublication).toHaveBeenCalledExactlyOnceWith(identifier);
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(publication, null, 2) },
      ]);
    });

    it.each([
      {},
      { id: "" },
      { slug: "" },
      { domain: "" },
      { id: "", slug: "", domain: "" },
      { id: "pub_1", slug: "my-publication", domain: "" },
      { id: "pub_1", slug: "", domain: "example.com" },
      { id: "", slug: "my-publication", domain: "example.com" },
      { id: "pub_1", slug: "my-publication", domain: "example.com" },
    ])("rejects missing or conflicting identifiers: %j", async (args) => {
      const result = await ctx.client.callTool({
        name: "get-publication",
        arguments: args,
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: "text", text: "Provide exactly one of id, slug, or domain" },
      ]);
      expect(ctx.getApi).not.toHaveBeenCalled();
    });

    it("still rejects an overlong non-empty slug", async () => {
      const result = await ctx.client.callTool({
        name: "get-publication",
        arguments: { slug: "a".repeat(257) },
      });

      expect(result.isError).toBe(true);
      expect(ctx.getApi).not.toHaveBeenCalled();
    });
  });

  describe("get-coin", () => {
    it.each([{ id: "coin_1" }, { contractAddress }])(
      "resolves %j with omitted siblings",
      async (identifier) => {
        const result = await ctx.client.callTool({
          name: "get-coin",
          arguments: identifier,
        });

        expect(result.isError).toBeFalsy();
        expect(ctx.getCoin).toHaveBeenCalledExactlyOnceWith(identifier);
      }
    );

    it.each([{ id: "coin_1" }, { contractAddress }])(
      "resolves %j with empty siblings and popular=false",
      async (identifier) => {
        const result = await ctx.client.callTool({
          name: "get-coin",
          arguments: { id: "", contractAddress: "", popular: false, ...identifier },
        });

        expect(result.isError).toBeFalsy();
        expect(ctx.getCoin).toHaveBeenCalledExactlyOnceWith(identifier);
        expect(result.content).toEqual([
          { type: "text", text: JSON.stringify(coin, null, 2) },
        ]);
      }
    );

    it.each([
      { popular: true },
      { id: "", contractAddress: "", popular: true },
    ])("lists popular coins for %j", async (args) => {
      const result = await ctx.client.callTool({
        name: "get-coin",
        arguments: args,
      });

      expect(result.isError).toBeFalsy();
      expect(ctx.getCoin).toHaveBeenCalledExactlyOnceWith({ sortBy: "popular" });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify([coin], null, 2) },
      ]);
    });

    it.each([
      {},
      { id: "" },
      { contractAddress: "" },
      { popular: false },
      { id: "", contractAddress: "", popular: false },
      { id: "coin_1", contractAddress },
      { id: "coin_1", popular: true },
      { contractAddress, popular: true },
      { contractAddress: "not-an-address" },
      { id: "coin_1", contractAddress: "not-an-address" },
    ])("rejects missing, conflicting, or invalid selectors: %j", async (args) => {
      const result = await ctx.client.callTool({
        name: "get-coin",
        arguments: args,
      });

      expect(result.isError).toBe(true);
      expect(ctx.getApi).not.toHaveBeenCalled();
    });
  });
});
