import { ParagraphApiError } from "@paragraph-com/sdk";

export const PARAGRAPH_FRONTEND = "https://paragraph.com";

/** Return an MCP error response. */
export function error(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/**
 * Map a caught error to an MCP error response with explicit recovery guidance
 * for the calling agent. Recognises ParagraphApiError status codes (401/403/404/429)
 * and points at the tools an agent can call next. Client-side 4xx return an
 * `isError` result the agent can recover from; genuine failures (5xx, or any
 * non-ParagraphApiError) rethrow so PostHog captures them as real exceptions.
 */
export function toError(err: unknown) {
  if (err instanceof ParagraphApiError) {
    // The public API returns its message under `msg` (apiError responses) or
    // `message`/`error` (validation errors); `err.message` is only the generic
    // "Request failed with status N". Check the body fields first so detailed
    // errors — like the 409 telling the agent a writer edited the post in the
    // editor and to re-read it — actually reach the agent (PAR-9436).
    const data = err.data as
      | { msg?: string; message?: string; error?: string }
      | undefined;
    const serverMsg =
      data?.msg || data?.message || data?.error || err.message;
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
    if (err.status >= 400 && err.status < 500) {
      return error(serverMsg || "Request failed.");
    }
  }
  // 5xx and non-ParagraphApiError failures are genuine, not agent-recoverable.
  // Rethrow so PostHog captures them as real exceptions instead of hiding them
  // among the expected 4xx noise the agent handles.
  throw err;
}

/** Strip staticHtml and json fields from post objects — markdown is sufficient for LLMs. */
export function stripHeavyContent<T>(post: T): T {
  if (post && typeof post === "object") {
    const { staticHtml, json: _json, ...rest } = post as Record<string, unknown>;
    return rest as T;
  }
  return post;
}

/**
 * Strip only the bulky staticHtml, KEEPING the Tiptap `json`. Used for single
 * `get-post` reads so the agent can see and preserve non-markdown blocks
 * (buttons, linked images) it would otherwise be blind to — markdown alone has
 * no way to represent them (PAR-9429). List responses still use
 * {@link stripHeavyContent} to keep payloads small.
 */
export function stripHeavyContentExceptJson<T>(post: T): T {
  if (post && typeof post === "object") {
    const { staticHtml, ...rest } = post as Record<string, unknown>;
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
