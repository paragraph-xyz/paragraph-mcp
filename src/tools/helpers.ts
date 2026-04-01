/** Return an MCP error response. */
export function error(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
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
