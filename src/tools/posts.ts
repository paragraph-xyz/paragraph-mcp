import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetMe200, GetPostById200 } from "@paragraph-com/sdk";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  createPostBody,
  deletePostBySlugParams,
  deletePostParams,
  getPostByIdParams,
  getPostByIdQueryParams,
  getPostByPublicationSlugAndPostSlugParams,
  getPostsParams,
  getPostsQueryParams,
  listOwnPostsQueryParams,
  sendTestEmailParams,
  updatePostBody,
  updatePostBySlugParams,
  updatePostParams,
} from "@paragraph-com/sdk/zod";
import {
  error,
  json,
  PARAGRAPH_FRONTEND,
  stripHeavyContent,
  toError,
} from "./helpers.js";

export type PostUrls = Partial<Pick<GetPostById200, "id" | "slug" | "status">> & {
  editorUrl?: string;
  publicUrl?: string;
};

const POST_PREVIEW_DESCRIPTION =
  "Preview text used as the meta description in social cards, search results, and archive listings. Keep under 145 characters so it renders without truncation in Google, X, and Farcaster link previews.";

function buildPublicUrl(
  publication: Pick<GetMe200, "slug" | "customDomain">,
  postSlug: string
): string {
  return publication.customDomain
    ? `https://${publication.customDomain}/${postSlug}`
    : `${PARAGRAPH_FRONTEND}/@${publication.slug}/${postSlug}`;
}

/**
 * Best-effort enrichment of a mutation response with URLs the writer can
 * actually open. `editorUrl` is the authenticated draft view/edit page and is
 * returned for any status; `publicUrl` is the reader-facing URL and is only
 * returned when the post is actually published (it would 404 otherwise).
 * Falls back to the publication's custom domain when one is configured.
 *
 * The final lookup always goes through the authenticated by-id endpoint —
 * that's the only response shape that populates `status` for your own posts
 * (see `GetPostById200Status`). When the caller only has a slug, we resolve
 * it to an id via the public slug endpoint first (which 404s on drafts and
 * archived posts — acceptable since drafts are normally identified by id).
 *
 * Failures are logged and swallowed so enrichment never masks a successful mutation.
 */
export async function buildPostUrls(
  api: ParagraphAPI,
  getPublication: () => Promise<GetMe200 | null>,
  args: { id?: string; slug?: string }
): Promise<PostUrls> {
  try {
    const publication = await getPublication();
    let postId = args.id;
    if (!postId && args.slug && publication) {
      try {
        const lookup = await api.posts
          .get(
            { publicationSlug: publication.slug, postSlug: args.slug },
            { includeContent: false }
          )
          .single();
        postId = lookup.id;
      } catch {
        // Slug not found on the public endpoint (typically because the post
        // is a draft/archived). Skip enrichment — mutation already succeeded.
      }
    }
    if (!postId) return {};

    const post = await api.posts
      .get({ id: postId }, { includeContent: false })
      .single();

    const result: PostUrls = {
      id: post.id,
      slug: post.slug,
      editorUrl: `${PARAGRAPH_FRONTEND}/editor/${post.id}`,
    };
    if (post.status) result.status = post.status;
    if (publication && post.status === "published") {
      result.publicUrl = buildPublicUrl(publication, post.slug);
    }
    return result;
  } catch (err) {
    console.warn("[posts] buildPostUrls enrichment failed", err);
    return {};
  }
}

export function registerPostTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  let cachedPublication: GetMe200 | null = null;
  let cachedPublicationPromise: Promise<GetMe200 | null> | null = null;
  const getPublication = async (): Promise<GetMe200 | null> => {
    if (cachedPublication) return cachedPublication;
    if (cachedPublicationPromise) return cachedPublicationPromise;
    cachedPublicationPromise = (async () => {
      try {
        cachedPublication = await getApi().me.get();
        return cachedPublication;
      } catch {
        return null;
      } finally {
        cachedPublicationPromise = null;
      }
    })();
    return cachedPublicationPromise;
  };
  server.registerTool(
    "get-post",
    {
      title: "Get post",
      description:
        "Get a single post by ID, or by publication slug + post slug",
      inputSchema: {
        id: getPostByIdParams.shape.postId.optional().describe("Post ID"),
        publicationSlug: getPostByPublicationSlugAndPostSlugParams.shape.publicationSlug
          .optional()
          .describe("Publication slug (use with postSlug)"),
        postSlug: getPostByPublicationSlugAndPostSlugParams.shape.postSlug
          .optional()
          .describe("Post slug (use with publicationSlug)"),
        includeContent: getPostByIdQueryParams.shape.includeContent
          .unwrap()
          .default(true)
          .describe("Include post content as markdown (default: true)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const hasId = !!params.id;
      const hasSlugs = !!params.publicationSlug || !!params.postSlug;

      if (hasId && hasSlugs) {
        return error("Provide either id or publicationSlug+postSlug, not both");
      }
      if (hasSlugs && (!params.publicationSlug || !params.postSlug)) {
        return error("Both publicationSlug and postSlug are required together");
      }
      if (!hasId && !hasSlugs) {
        return error(
          "Provide either id, or both publicationSlug and postSlug"
        );
      }

      const api = getApi();

      try {
        if (params.id) {
          const post = await api.posts
            .get({ id: params.id }, { includeContent: params.includeContent })
            .single();
          return json(stripHeavyContent(post));
        }

        const post = await api.posts
          .get(
            {
              publicationSlug: params.publicationSlug!,
              postSlug: params.postSlug!,
            },
            { includeContent: params.includeContent }
          )
          .single();
        return json(stripHeavyContent(post));
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "list-posts",
    {
      title: "List posts",
      description:
        "List posts from a publication by publication ID, or list your own posts (requires API key). Supports pagination and status filtering. Tip: if you only need the total count, set limit to 1 — the response includes pagination.total. Start with a small limit and increase only if needed, as large limits may produce oversized responses.",
      inputSchema: {
        publicationId: getPostsParams.shape.publicationId.optional().describe(
          "Publication ID to list posts from. Omit to list your own posts (requires API key)."
        ),
        status: listOwnPostsQueryParams.shape.status.describe(
          "Filter by status (only for own posts)"
        ),
        limit: getPostsQueryParams.shape.limit
          .describe(
            "Number of posts to return (default: 10). Keep this small to avoid oversized responses — use pagination to retrieve more."
          ),
        cursor: getPostsQueryParams.shape.cursor,
        includeContent: getPostsQueryParams.shape.includeContent
          .unwrap()
          .default(false)
          .describe("Include post content as markdown (default: false)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      if (params.publicationId && params.status) {
        return error(
          "status filter is only supported when listing your own posts (omit publicationId)"
        );
      }

      const api = getApi();

      try {
        if (params.publicationId) {
          const { items, pagination } = await api.posts.get(
            { publicationId: params.publicationId },
            {
              limit: params.limit,
              cursor: params.cursor,
              includeContent: params.includeContent,
            }
          );
          return json({ posts: items.map(stripHeavyContent), pagination });
        }

        const { items, pagination } = await api.posts.list({
          status: params.status as "published" | "draft" | undefined,
          limit: params.limit,
          cursor: params.cursor,
          includeContent: params.includeContent,
        });
        return json({ posts: items.map(stripHeavyContent), pagination });
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "create-post",
    {
      title: "Create post",
      description:
        "Create a post in your publication. Defaults to a draft — set status to 'published' only with explicit user approval, as this makes the post publicly visible. Set scheduledAt to a future Unix ms timestamp to schedule first-publish — confirm with the user before scheduling, as the post will be published automatically at the scheduled time. Requires API key. Content must be in markdown format. Do not set sendNewsletter to true without explicit user approval — it emails all subscribers and cannot be undone.",
      inputSchema: {
        title: createPostBody.shape.title.describe("Post title"),
        markdown: createPostBody.shape.markdown.describe("Post content in markdown format"),
        subtitle: createPostBody.shape.subtitle,
        slug: createPostBody.shape.slug,
        imageUrl: createPostBody.shape.imageUrl,
        postPreview: createPostBody.shape.postPreview.describe(
          POST_PREVIEW_DESCRIPTION
        ),
        categories: createPostBody.shape.categories,
        sendNewsletter: createPostBody.shape.sendNewsletter,
        scheduledAt: createPostBody.shape.scheduledAt,
        status: createPostBody.shape.status
          .unwrap()
          .default("draft")
          .describe(
            "Post status. Defaults to 'draft'. Only set to 'published' with explicit user approval."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.posts.create(params);
        const urls = await buildPostUrls(api, getPublication, {
          id: result.id,
        });
        return json({ ...result, ...urls });
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "update-post",
    {
      title: "Update post",
      description:
        "Update an existing post by ID or slug. Only provided fields are updated — omit any field you don't want to change. Requires API key. Do NOT pass `status` unless you explicitly intend to change the publish state — and always confirm with the user before any status change: `status: 'published'` publishes the post, `status: 'draft'` unpublishes a live post, `status: 'archived'` archives. When updating other fields (title, markdown, categories, etc.) on a post, omit `status` entirely — do not echo back a value read from get-post/list-posts. Set scheduledAt to a future Unix ms timestamp to schedule first-publish (confirm with the user first — the post will publish automatically at the scheduled time); pass scheduledAt: null to cancel. Set publishedAt to a Unix ms timestamp to backdate (or post-date) the post's display date — once set, the value sticks across re-publishes.",
      inputSchema: {
        id: updatePostParams.shape.postId
          .optional()
          .describe("Post ID (use id or slug, not both)"),
        slug: updatePostBySlugParams.shape.slug
          .optional()
          .describe(
            "Post slug used to identify the post (use id or slug, not both). To rename the slug, see `newSlug`."
          ),
        newSlug: updatePostBody.shape.slug.describe(
          "New slug to rename the post to. Requires identifying the post by `id`, not `slug`. Changes the public URL and breaks existing links / SEO — confirm with the user before renaming a published post."
        ),
        title: updatePostBody.shape.title,
        markdown: updatePostBody.shape.markdown,
        subtitle: updatePostBody.shape.subtitle,
        status: updatePostBody.shape.status.describe(
          "OMIT unless explicitly changing publish state. Always confirm with the user before any status change. 'published' publishes; 'draft' unpublishes a live post; 'archived' archives. Do NOT pass this field when updating other fields like title or markdown — and never round-trip a value read from get-post/list-posts."
        ),
        scheduledAt: updatePostBody.shape.scheduledAt,
        publishedAt: updatePostBody.shape.publishedAt.describe(
          "Unix ms timestamp to set as the post's display publish date. Once set, the value is preserved across re-publishes. Useful for backdating imported content or correcting a publish date."
        ),
        sendNewsletter: updatePostBody.shape.sendNewsletter,
        postPreview: updatePostBody.shape.postPreview.describe(
          POST_PREVIEW_DESCRIPTION
        ),
        categories: updatePostBody.shape.categories,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const { id, slug, newSlug, ...rest } = params;

      if (id && slug) {
        return error("Provide either id or slug, not both");
      }
      if (!id && !slug) {
        return error("Provide either id or slug");
      }
      if (slug && newSlug !== undefined) {
        return error(
          "Cannot rename the slug when identifying the post by slug (the request path would target the new slug before it exists). Identify the post by id instead — look it up with get-post if needed."
        );
      }

      const body = newSlug !== undefined ? { ...rest, slug: newSlug } : rest;

      try {
        const api = getApi();
        const result = id
          ? await api.posts.update({ id, ...body })
          : await api.posts.update({ slug: slug!, ...body });
        const urls = await buildPostUrls(
          api,
          getPublication,
          id ? { id } : { slug: slug! }
        );
        return json({ ...result, ...urls });
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "delete-post",
    {
      title: "Delete post",
      description:
        "Permanently delete a post by ID or slug. This action is irreversible. Always confirm with the user before deleting. Requires API key.",
      inputSchema: {
        id: deletePostParams.shape.postId.optional().describe("Post ID"),
        slug: deletePostBySlugParams.shape.slug.optional().describe("Post slug"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      if (params.id && params.slug) {
        return error("Provide either id or slug, not both");
      }
      if (!params.id && !params.slug) {
        return error("Provide either id or slug");
      }

      try {
        const api = getApi();
        const result = params.id
          ? await api.posts.delete({ id: params.id })
          : await api.posts.delete({ slug: params.slug! });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "send-test-email",
    {
      title: "Send test email",
      description:
        "Send a test newsletter email for a draft post to the publication owner. Only works for draft posts. Requires API key.",
      inputSchema: {
        id: sendTestEmailParams.shape.postId.describe("Post ID"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.posts.sendTestEmail({ id: params.id });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
