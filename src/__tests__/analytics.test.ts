import type { ParagraphAPI } from "@paragraph-com/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAnalyticsOptions,
  clearIdentityCacheForTests,
  FIRST_PARTY_CLIENT_HEADER,
} from "../analytics.js";
import { beforeSendMcpEvent } from "../posthog-before-send.js";

function apiWithMe(me: Record<string, unknown>) {
  const get = vi.fn().mockResolvedValue(me);
  const api = { me: { get } } as unknown as ParagraphAPI;
  return { api, get };
}

const ME = {
  id: "pub-1",
  name: "Test",
  ownerUserId: "owner-1",
  slug: "test",
};

const request = { method: "tools/call", params: { name: "get-post" } };

beforeEach(() => {
  vi.useFakeTimers();
  clearIdentityCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildAnalyticsOptions identify", () => {
  it("resolves owner distinct_id, publication group, and defensive plan", async () => {
    const { api } = apiWithMe({ ...ME, plan: "growth" });
    const options = buildAnalyticsOptions({
      getApi: () => api,
      apiKey: "para_key",
      transport: "worker",
    });

    const identity = await (options.identify as Function)(request);
    expect(identity).toEqual({
      distinctId: "owner-1",
      properties: { publication_id: "pub-1", plan: "growth" },
      groups: { publication: "pub-1" },
    });
  });

  it("omits plan when the API does not return one yet", async () => {
    const { api } = apiWithMe(ME);
    const options = buildAnalyticsOptions({
      getApi: () => api,
      apiKey: "para_key",
      transport: "worker",
    });

    const identity = await (options.identify as Function)(request);
    expect(identity?.properties).toEqual({ publication_id: "pub-1" });
  });

  it("caches per key: two calls, one me.get", async () => {
    const { api, get } = apiWithMe(ME);
    const options = buildAnalyticsOptions({
      getApi: () => api,
      apiKey: "para_key",
      transport: "worker",
    });

    await (options.identify as Function)(request);
    await (options.identify as Function)(request);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent resolutions", async () => {
    let release: (value: unknown) => void = () => {};
    const get = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const api = { me: { get } } as unknown as ParagraphAPI;
    const options = buildAnalyticsOptions({
      getApi: () => api,
      apiKey: "para_key",
      transport: "worker",
    });

    const first = (options.identify as Function)(request);
    const second = (options.identify as Function)(request);
    release(ME);

    expect((await first)?.distinctId).toBe("owner-1");
    expect((await second)?.distinctId).toBe("owner-1");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("re-resolves after the positive TTL", async () => {
    const { api, get } = apiWithMe(ME);
    const options = buildAnalyticsOptions({
      getApi: () => api,
      apiKey: "para_key",
      transport: "worker",
    });

    await (options.identify as Function)(request);
    vi.advanceTimersByTime(16 * 60_000);
    await (options.identify as Function)(request);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("fails open on me.get errors and caches the failure briefly", async () => {
    const get = vi.fn().mockRejectedValue(new Error("api down"));
    const api = { me: { get } } as unknown as ParagraphAPI;
    const options = buildAnalyticsOptions({
      getApi: () => api,
      apiKey: "para_key",
      transport: "worker",
    });

    expect(await (options.identify as Function)(request)).toBeNull();
    expect(await (options.identify as Function)(request)).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61_000);
    await (options.identify as Function)(request);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("returns null without calling the API when there is no key", async () => {
    const { api, get } = apiWithMe(ME);
    const options = buildAnalyticsOptions({
      getApi: () => api,
      apiKey: undefined,
      transport: "stdio",
    });

    expect(await (options.identify as Function)(request)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("buildAnalyticsOptions eventProperties", () => {
  const bareOptions = (
    getClientInfo?: () => { name?: string; version?: string } | undefined
  ) =>
    buildAnalyticsOptions({
      getApi: () => ({}) as ParagraphAPI,
      apiKey: "para_key",
      transport: "stdio",
      getClientInfo,
    });

  it("stamps the transport and the first-party header when present", () => {
    const properties = (bareOptions().eventProperties as Function)(request, {
      requestInfo: {
        headers: { [FIRST_PARTY_CLIENT_HEADER]: "paragraph-app-agent" },
      },
    });
    expect(properties).toMatchObject({
      mcp_transport: "stdio",
      paragraph_first_party: "paragraph-app-agent",
    });
  });

  it("reads the compat top-level headers shape too", () => {
    const properties = (bareOptions().eventProperties as Function)(request, {
      headers: { [FIRST_PARTY_CLIENT_HEADER]: ["paragraph-app-agent"] },
    });
    expect(properties.paragraph_first_party).toBe("paragraph-app-agent");
  });

  it("reports null first-party for third-party callers", () => {
    const properties = (bareOptions().eventProperties as Function)(
      request,
      {}
    );
    expect(properties.paragraph_first_party).toBeNull();
  });

  it("stamps client info only when the server has it", () => {
    const withInfo = (bareOptions(() => ({
      name: "claude-code",
      version: "2.1.220",
    })).eventProperties as Function)(request, {});
    expect(withInfo).toMatchObject({
      $mcp_client_name: "claude-code",
      $mcp_client_version: "2.1.220",
    });

    const withoutInfo = (bareOptions(() => undefined).eventProperties as
      Function)(request, {});
    expect(withoutInfo.$mcp_client_name).toBeUndefined();
  });
});

describe("buildAnalyticsOptions beforeSend", () => {
  it("reuses the existing synthetic-exception filter", () => {
    const options = buildAnalyticsOptions({
      getApi: () => ({}) as ParagraphAPI,
      apiKey: "para_key",
      transport: "worker",
    });
    expect(options.beforeSend).toBe(beforeSendMcpEvent);
  });
});
