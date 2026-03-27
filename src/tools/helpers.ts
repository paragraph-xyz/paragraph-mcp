/** Return an MCP error response. */
export function error(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/** Return an MCP success response with JSON-serialized data. */
export function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
