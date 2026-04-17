import { ParagraphApiError } from "@paragraph-com/sdk";

/** Return an MCP error response. */
export function error(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/**
 * Map a caught error to an MCP error response with explicit recovery guidance
 * for the calling agent. Recognises ParagraphApiError status codes (401/403/404/429)
 * and points at the tools an agent can call next. Falls back to the raw message
 * for everything else.
 */
export function toError(err: unknown) {
  if (err instanceof ParagraphApiError) {
    const data = err.data as { message?: string } | undefined;
    const serverMsg = data?.message || err.message;
    if (err.status === 401) {
      return error(
        "Unauthorized. Your API key is invalid, expired, or missing. Get a new key at paragraph.com/settings → Publication → Developer."
      );
    }
    if (err.status === 403) {
      return error(
        "Forbidden. Your API key doesn't have access to this resource. Call `get-me` to verify which publication the key is for."
      );
    }
    if (err.status === 404) {
      const detail = serverMsg ? `${serverMsg}. ` : "";
      return error(
        `Not found. ${detail}Verify the identifier — call the matching list/search tool (e.g. list-posts, search-posts, list-subscribers, search-blogs) to find valid values.`
      );
    }
    if (err.status === 429) {
      return error("Rate limited. Wait a moment and retry.");
    }
    return error(serverMsg || "Request failed.");
  }
  return error(String(err instanceof Error ? err.message : err));
}

/** Strip staticHtml and json fields from post objects — markdown is sufficient for LLMs. */
export function stripHeavyContent<T>(post: T): T {
  if (post && typeof post === "object") {
    const { staticHtml, json: _json, ...rest } = post as Record<string, unknown>;
    return rest as T;
  }
  return post;
}

/** Return an MCP success response with JSON-serialized data. */
export function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
