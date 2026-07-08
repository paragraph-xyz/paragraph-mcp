import type { BeforeSendFn } from "@posthog/mcp";

type ExceptionListEntry = { mechanism?: { synthetic?: boolean } };

/**
 * Adjust auto-captured events before they reach PostHog. Shared by the worker
 * (`mcp-handler.ts`) and the npx entrypoint (`index.ts`).
 *
 * `$exception`: @posthog/mcp captures one for every tool result flagged
 * `isError`. Tools return those for outcomes the agent recovers from (a 404, a
 * validation hint, a stale-post conflict), which coerce to *synthetic*
 * exceptions. Drop those so Error Tracking only sees genuine failures, which
 * `toError` rethrows so they arrive as real (non-synthetic) errors with a
 * stack. The `$mcp_tool_call` event still records the error either way.
 *
 * `$mcp_tools_list`: drop the bulky `$mcp_response` payload.
 */
export const beforeSendMcpEvent: BeforeSendFn = (event) => {
  if (event.event === "$exception") {
    const list = event.properties.$exception_list as
      | ExceptionListEntry[]
      | undefined;
    return list?.[0]?.mechanism?.synthetic === true ? null : event;
  }

  if (event.event === "$mcp_tools_list") {
    const next = { ...event, properties: { ...event.properties } };
    delete next.properties.$mcp_response;
    return next;
  }

  return event;
};
