import { createHash } from "node:crypto";
import type { ParagraphAPI } from "@paragraph-com/sdk";
import type { MCPAnalyticsOptions, UserIdentity } from "@posthog/mcp";
import { beforeSendMcpEvent } from "./posthog-before-send.js";

/**
 * Shared PostHog instrumentation options for every entrypoint (PAR-10191).
 *
 * Adds what the default auto-capture can't:
 *
 * - `identify`: resolves the API key to a stable identity (publication owner
 *   as distinct_id, publication group, plan) via a cached `me.get()`. The
 *   worker builds a fresh server per POST, so @posthog/mcp's per-server
 *   identity cache never hits there — the cache below is module-scoped and
 *   keyed by key hash instead.
 * - `eventProperties`: stamps the transport, the first-party marker header
 *   (sent by the in-app agent), and — on long-lived stdio servers — the
 *   client name/version, which works around the upstream session cache bug
 *   that makes `$mcp_client_name` alternate between events.
 *
 * Everything is fail-open: identity resolution errors are cached briefly and
 * events go out unidentified rather than delayed or dropped.
 *
 * Latency note: @posthog/mcp awaits `identify` in-path before initialize and
 * each tool call. The cache plus the resolve timeout bound that cost to one
 * lookup of at most RESOLVE_TIMEOUT_MS per isolate/key per TTL window; every
 * other call is a synchronous cache hit.
 */

const POSITIVE_TTL_MS = 15 * 60_000;
const NEGATIVE_TTL_MS = 60_000;
const RESOLVE_TIMEOUT_MS = 1_500;
const MAX_CACHE_ENTRIES = 500;

/** Header the in-app Mastra agent sends on every loopback request. */
export const FIRST_PARTY_CLIENT_HEADER = "x-paragraph-client";

type CachedIdentity = { identity: UserIdentity | null; expiresAt: number };

const identityCache = new Map<string, CachedIdentity>();
const inFlight = new Map<string, Promise<UserIdentity | null>>();

export function clearIdentityCacheForTests(): void {
  identityCache.clear();
  inFlight.clear();
}

function keyHash(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

function storeIdentity(hash: string, identity: UserIdentity | null): void {
  // Delete-then-set so a refreshed key moves to the Map's tail; eviction
  // below then drops the genuinely oldest entry, not a just-refreshed one.
  identityCache.delete(hash);
  if (identityCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = identityCache.keys().next().value;
    if (oldest !== undefined) identityCache.delete(oldest);
  }
  const ttl = identity ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  identityCache.set(hash, { identity, expiresAt: Date.now() + ttl });
}

async function resolveIdentity(
  getApi: () => ParagraphAPI
): Promise<UserIdentity | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("identity resolution timed out")),
        RESOLVE_TIMEOUT_MS
      );
    });
    const me = await Promise.race([getApi().me.get(), timeout]);
    // `plan` ships from the API ahead of the published SDK types; the SDK
    // passes unknown response fields through untouched.
    const plan = (me as { plan?: string }).plan;
    return {
      distinctId: me.ownerUserId,
      properties: {
        publication_id: me.id,
        ...(plan ? { plan } : {}),
      },
      groups: { publication: me.id },
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readHeader(extra: unknown, name: string): string | null {
  if (!extra || typeof extra !== "object") return null;
  const record = extra as {
    headers?: Record<string, string | string[]>;
    requestInfo?: { headers?: Record<string, string | string[]> };
  };
  const headers = record.requestInfo?.headers ?? record.headers;
  const value = headers?.[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export interface BuildAnalyticsOptionsInput {
  getApi: () => ParagraphAPI;
  apiKey: string | undefined;
  transport: "worker" | "stdio" | "http";
  /**
   * Reads the connected client's advertised info, when the server is
   * long-lived enough to have it (stdio). Stateless transports return
   * undefined on tool-call requests; that's expected.
   */
  getClientInfo?: () => { name?: string; version?: string } | undefined;
}

export function buildAnalyticsOptions(
  input: BuildAnalyticsOptionsInput
): Pick<MCPAnalyticsOptions, "identify" | "eventProperties" | "beforeSend"> {
  const { getApi, apiKey, transport, getClientInfo } = input;
  const hash = apiKey ? keyHash(apiKey) : null;

  return {
    // Drop $identify events entirely. Two reasons: the worker builds a fresh
    // server per POST, so the library's has-identity-changed cache is always
    // empty and it would emit one $identify per request (pure volume); and
    // $identify embeds the raw handler request/extra in $mcp_parameters —
    // on the worker transport that includes the Authorization header, which
    // must never reach PostHog. Nothing is lost: identity already rides
    // every event via distinct_id, $set, and $groups.
    beforeSend: (event) => {
      if (event.event === "$identify") return null;
      return beforeSendMcpEvent(event);
    },

    identify: async () => {
      if (!hash) return null;

      const cached = identityCache.get(hash);
      if (cached && cached.expiresAt > Date.now()) return cached.identity;

      const pending = inFlight.get(hash);
      if (pending) return pending;

      const promise = resolveIdentity(getApi)
        .then((identity) => {
          storeIdentity(hash, identity);
          return identity;
        })
        .finally(() => {
          inFlight.delete(hash);
        });
      inFlight.set(hash, promise);
      return promise;
    },

    eventProperties: (_request, extra) => {
      const clientInfo = getClientInfo?.();
      return {
        mcp_transport: transport,
        paragraph_first_party: readHeader(extra, FIRST_PARTY_CLIENT_HEADER),
        ...(clientInfo?.name
          ? {
              $mcp_client_name: clientInfo.name,
              ...(clientInfo.version
                ? { $mcp_client_version: clientInfo.version }
                : {}),
            }
          : {}),
      };
    },
  };
}
