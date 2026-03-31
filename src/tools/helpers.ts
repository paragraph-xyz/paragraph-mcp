/** Return an MCP error response. */
export function error(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// ~25 000 tokens ≈ 100 000 characters (conservative 4 chars/token estimate)
const MAX_RESPONSE_CHARS = 100_000;

/**
 * Truncate data so the serialized JSON stays under the token limit.
 * For objects with an array field (e.g. { posts: [...], pagination }),
 * items are removed from the end of the array to keep the response valid JSON
 * and preserve the pagination cursor.
 */
function truncate(data: unknown): { data: unknown; truncated: boolean } {
  const text = JSON.stringify(data, null, 2);
  if (text.length <= MAX_RESPONSE_CHARS) {
    return { data, truncated: false };
  }

  // For arrays, remove items from the end until it fits
  if (Array.isArray(data)) {
    const arr = [...data];
    while (arr.length > 0 && JSON.stringify(arr, null, 2).length > MAX_RESPONSE_CHARS) {
      arr.pop();
    }
    return { data: arr, truncated: true };
  }

  // For objects with an array field (e.g. { posts: [...], pagination: {...} }),
  // truncate the largest array field
  if (data !== null && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    let largestKey: string | null = null;
    let largestLen = 0;
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val) && val.length > largestLen) {
        largestKey = key;
        largestLen = val.length;
      }
    }

    if (largestKey) {
      const arr = [...(obj[largestKey] as unknown[])];
      const copy = { ...obj, [largestKey]: arr };
      while (arr.length > 0 && JSON.stringify(copy, null, 2).length > MAX_RESPONSE_CHARS) {
        arr.pop();
        copy[largestKey] = arr;
      }
      return { data: copy, truncated: true };
    }
  }

  // Fallback: return stringified and sliced (shouldn't normally happen)
  return { data, truncated: true };
}

/** Return an MCP success response with JSON-serialized data. */
export function json(data: unknown) {
  const { data: result, truncated } = truncate(data);
  let text = JSON.stringify(result, null, 2);
  if (truncated) {
    text += "\n\n[Response truncated — use pagination or narrower filters to retrieve more data]";
  }
  return {
    content: [{ type: "text" as const, text }],
  };
}
