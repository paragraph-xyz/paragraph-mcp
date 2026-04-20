import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GetMe200, ParagraphAPI } from "@paragraph-com/sdk";
import { buildPostUrls } from "../tools/posts.js";

type PostStub = {
  id: string;
  slug: string;
  status?: "draft" | "published" | "scheduled" | "archived";
};

type ApiPostsStub = {
  byId?: PostStub | Error;
  bySlug?: PostStub | Error;
};

function apiWithPosts(stubs: ApiPostsStub | PostStub | Error) {
  const normalized: ApiPostsStub =
    stubs && typeof stubs === "object" && !(stubs instanceof Error) && ("byId" in stubs || "bySlug" in stubs)
      ? (stubs as ApiPostsStub)
      : { byId: stubs as PostStub | Error, bySlug: stubs as PostStub | Error };

  const chainable = (result: PostStub | Error | undefined) => {
    const single = () => {
      if (!result) return Promise.reject(new Error("no stub configured"));
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    };
    return { single };
  };
  const getFn = vi.fn((identifier: Record<string, string>) => {
    if ("id" in identifier) return chainable(normalized.byId);
    if ("publicationSlug" in identifier) return chainable(normalized.bySlug);
    return chainable(new Error(`unexpected identifier: ${JSON.stringify(identifier)}`));
  });
  return {
    api: { posts: { get: getFn } } as unknown as ParagraphAPI,
    getFn,
  };
}

const publication = (overrides?: Partial<GetMe200>): GetMe200 => ({
  id: "pub_1",
  name: "My Blog",
  ownerUserId: "user_1",
  slug: "my-blog",
  ...overrides,
});

describe("buildPostUrls", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("by id", () => {
    it("returns editorUrl and canonical fields for a draft, but no publicUrl", async () => {
      const { api } = apiWithPosts({ id: "p_1", slug: "hello-world", status: "draft" });
      const getPub = vi.fn().mockResolvedValue(publication());

      const out = await buildPostUrls(api, getPub, { id: "p_1" });

      expect(out).toEqual({
        id: "p_1",
        slug: "hello-world",
        status: "draft",
        editorUrl: "https://paragraph.com/editor/p_1",
      });
      expect(out.publicUrl).toBeUndefined();
    });

    it("returns publicUrl only when status is published", async () => {
      const { api } = apiWithPosts({
        id: "p_2",
        slug: "launch-day",
        status: "published",
      });
      const getPub = vi.fn().mockResolvedValue(publication());

      const out = await buildPostUrls(api, getPub, { id: "p_2" });

      expect(out.publicUrl).toBe("https://paragraph.com/@my-blog/launch-day");
    });

    it("uses custom domain when the publication has one", async () => {
      const { api } = apiWithPosts({
        id: "p_3",
        slug: "launch-day",
        status: "published",
      });
      const getPub = vi
        .fn()
        .mockResolvedValue(publication({ customDomain: "ethdaily.io" }));

      const out = await buildPostUrls(api, getPub, { id: "p_3" });

      expect(out.publicUrl).toBe("https://ethdaily.io/launch-day");
    });

    it("still returns editorUrl when getPublication fails", async () => {
      const { api } = apiWithPosts({ id: "p_4", slug: "x", status: "published" });
      const getPub = vi.fn().mockResolvedValue(null);

      const out = await buildPostUrls(api, getPub, { id: "p_4" });

      expect(out.editorUrl).toBe("https://paragraph.com/editor/p_4");
      expect(out.publicUrl).toBeUndefined();
    });
  });

  describe("by slug", () => {
    it("resolves slug via public endpoint, then re-fetches by id for status", async () => {
      const { api, getFn } = apiWithPosts({
        bySlug: { id: "p_5", slug: "new-slug" },
        byId: { id: "p_5", slug: "new-slug", status: "published" },
      });
      const getPub = vi.fn().mockResolvedValue(publication());

      const out = await buildPostUrls(api, getPub, { slug: "new-slug" });

      expect(getFn).toHaveBeenCalledTimes(2);
      expect(getFn).toHaveBeenNthCalledWith(
        1,
        { publicationSlug: "my-blog", postSlug: "new-slug" },
        { includeContent: false }
      );
      expect(getFn).toHaveBeenNthCalledWith(
        2,
        { id: "p_5" },
        { includeContent: false }
      );
      expect(out.id).toBe("p_5");
      expect(out.status).toBe("published");
      expect(out.publicUrl).toBe("https://paragraph.com/@my-blog/new-slug");
    });

    it("returns {} when the public slug lookup 404s (draft/archived)", async () => {
      const { api } = apiWithPosts({
        bySlug: new Error("404"),
        byId: { id: "p_x", slug: "x", status: "draft" },
      });
      const getPub = vi.fn().mockResolvedValue(publication());

      const out = await buildPostUrls(api, getPub, { slug: "unreachable" });

      expect(out).toEqual({});
    });

    it("returns {} when publication lookup fails (can't resolve slug)", async () => {
      const { api } = apiWithPosts({ id: "p_6", slug: "x", status: "draft" });
      const getPub = vi.fn().mockResolvedValue(null);

      const out = await buildPostUrls(api, getPub, { slug: "anything" });

      expect(out).toEqual({});
    });
  });

  describe("failure handling", () => {
    it("returns {} when posts.get by id throws", async () => {
      const { api } = apiWithPosts(new Error("not found"));
      const getPub = vi.fn().mockResolvedValue(publication());

      const out = await buildPostUrls(api, getPub, { id: "missing" });

      expect(out).toEqual({});
    });

    it("returns {} when neither id nor slug is provided", async () => {
      const { api } = apiWithPosts({ id: "n/a", slug: "n/a" });
      const getPub = vi.fn().mockResolvedValue(publication());

      const out = await buildPostUrls(api, getPub, {});

      expect(out).toEqual({});
    });
  });
});
