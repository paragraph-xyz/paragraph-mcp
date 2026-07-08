import { describe, it, expect } from "vitest";
import { beforeSendMcpEvent } from "../posthog-before-send.js";

function event(name: string, properties: Record<string, unknown>) {
  return {
    event: name,
    distinct_id: "ses_test",
    timestamp: new Date().toISOString(),
    type: "capture" as const,
    properties,
  };
}

function exceptionEvent(synthetic: boolean) {
  return event("$exception", {
    $exception_list: [
      { type: "Error", value: "boom", mechanism: { handled: true, synthetic } },
    ],
  });
}

describe("beforeSendMcpEvent", () => {
  it("drops synthetic exceptions (handled tool `isError` results)", async () => {
    expect(await beforeSendMcpEvent(exceptionEvent(true))).toBeNull();
  });

  it("keeps real thrown exceptions (genuine server failures)", async () => {
    const e = exceptionEvent(false);
    expect(await beforeSendMcpEvent(e)).toBe(e);
  });

  it("strips the bulky response from tools-list events", async () => {
    const result = await beforeSendMcpEvent(
      event("$mcp_tools_list", { $mcp_response: "big", $mcp_tools_count: 3 })
    );
    expect(result?.properties.$mcp_response).toBeUndefined();
    expect(result?.properties.$mcp_tools_count).toBe(3);
  });

  it("passes tool-call events through untouched", async () => {
    const e = event("$mcp_tool_call", {
      $mcp_tool_name: "get-publication",
      $mcp_is_error: true,
    });
    expect(await beforeSendMcpEvent(e)).toBe(e);
  });
});
