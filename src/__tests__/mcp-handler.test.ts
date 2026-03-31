import { describe, it, expect } from "vitest";
import { mcpHandler } from "../mcp-handler.js";

function mockCtx(props?: { apiKey: string }) {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props,
  } as unknown as ExecutionContext;
}

function postRequest(
  url: string,
  body: unknown,
  headers?: Record<string, string>
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const INIT_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  },
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("mcpHandler auth", () => {
  it("returns 401 when ctx.props is missing", async () => {
    const req = postRequest("https://mcp.example.com/mcp", INIT_BODY);
    const res = await mcpHandler.fetch(req, {}, mockCtx());
    expect(res.status).toBe(401);
  });

  it("returns 401 when apiKey is empty", async () => {
    const req = postRequest("https://mcp.example.com/mcp", INIT_BODY);
    const res = await mcpHandler.fetch(req, {}, mockCtx({ apiKey: "" }));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET — Legacy SSE
// ---------------------------------------------------------------------------

describe("mcpHandler GET (legacy SSE)", () => {
  it("returns SSE stream with endpoint event", async () => {
    const controller = new AbortController();
    const req = new Request("https://mcp.example.com/mcp", {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });

    const res = await mcpHandler.fetch(req, {}, mockCtx({ apiKey: "test-key" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");

    // Read the first chunk (endpoint event)
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("event: endpoint");
    expect(text).toContain("data: /mcp/message");

    controller.abort();
  });

  it("preserves query params in endpoint URL", async () => {
    const controller = new AbortController();
    const req = new Request("https://mcp.example.com/mcp?token=abc", {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });

    const res = await mcpHandler.fetch(req, {}, mockCtx({ apiKey: "test-key" }));
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("/mcp/message?token=abc");

    controller.abort();
  });
});

// ---------------------------------------------------------------------------
// POST — Streamable HTTP
// ---------------------------------------------------------------------------

describe("mcpHandler POST (streamable HTTP)", () => {
  it("handles initialize request on /mcp", async () => {
    const req = postRequest("https://mcp.example.com/mcp", INIT_BODY);
    const res = await mcpHandler.fetch(req, {}, mockCtx({ apiKey: "test-key" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");

    const body = await res.json();
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: "Paragraph" },
      },
    });
  });

  it("handles initialize request on /mcp/message", async () => {
    const req = postRequest("https://mcp.example.com/mcp/message", INIT_BODY);
    const res = await mcpHandler.fetch(req, {}, mockCtx({ apiKey: "test-key" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("Paragraph");
  });

  it("returns error for invalid JSON-RPC", async () => {
    const req = postRequest("https://mcp.example.com/mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "nonexistent/method",
      params: {},
    });
    const res = await mcpHandler.fetch(req, {}, mockCtx({ apiKey: "test-key" }));

    // The SDK returns a JSON-RPC error for unknown methods
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Unsupported methods
// ---------------------------------------------------------------------------

describe("mcpHandler unsupported methods", () => {
  it("returns 405 for DELETE", async () => {
    const req = new Request("https://mcp.example.com/mcp", {
      method: "DELETE",
    });
    const res = await mcpHandler.fetch(req, {}, mockCtx({ apiKey: "test-key" }));
    expect(res.status).toBe(405);
  });

  it("returns 405 for PUT", async () => {
    const req = new Request("https://mcp.example.com/mcp", {
      method: "PUT",
    });
    const res = await mcpHandler.fetch(req, {}, mockCtx({ apiKey: "test-key" }));
    expect(res.status).toBe(405);
  });
});
