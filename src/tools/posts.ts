import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  getPostByIdParams,
  getPostByIdQueryParams,
  getPostByPublicationSlugAndPostSlugParams,
  getPostsParams,
  getPostsQueryParams,
  listOwnPostsQueryParams,
  createPostBody,
  updatePostBody,
  sendTestEmailParams,
} from "@paragraph-com/sdk/zod";
import { z } from "zod";
import { error, json, stripHeavyContent } from "./helpers.js";

export function registerPostTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "get-post",
    "Get a single post by ID, or by publication slug + post slug",
    {
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
    {
      title: "Get post",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "list-posts",
    "List posts from a publication by publication ID, or list your own posts (requires API key). Supports pagination and status filtering. Tip: if you only need the total count, set limit to 1 — the response includes pagination.total. Start with a small limit and increase only if needed, as large limits may produce oversized responses.",
    {
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
    {
      title: "List posts",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "create-post",
    "Create a post in your publication. Defaults to a draft — set status to 'published' only with explicit user approval, as this makes the post publicly visible. Set scheduledAt to a future Unix ms timestamp to schedule first-publish — confirm with the user before scheduling, as the post will be published automatically at the scheduled time. Requires API key. Content must be in markdown format. Do not set sendNewsletter to true without explicit user approval — it emails all subscribers and cannot be undone.",
    {
      title: createPostBody.shape.title.describe("Post title"),
      markdown: createPostBody.shape.markdown.describe("Post content in markdown format"),
      subtitle: createPostBody.shape.subtitle,
      slug: createPostBody.shape.slug,
      imageUrl: createPostBody.shape.imageUrl,
      postPreview: createPostBody.shape.postPreview,
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
    {
      title: "Create post",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.posts.create(params);
        return json(result);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "update-post",
    "Update an existing post by ID or slug. Only provided fields are updated. Requires API key. Setting status to 'published' makes the post publicly visible — always confirm with the user before publishing. Set scheduledAt to a future Unix ms timestamp to schedule first-publish (confirm with the user first — the post will publish automatically at the scheduled time); pass scheduledAt: null to cancel.",
    {
      id: z.string().min(1).optional().describe("Post ID (use id or slug, not both)"),
      slug: z.string().min(1).optional().describe("Post slug (use id or slug, not both)"),
      title: updatePostBody.shape.title,
      markdown: updatePostBody.shape.markdown,
      subtitle: updatePostBody.shape.subtitle,
      status: updatePostBody.shape.status,
      scheduledAt: updatePostBody.shape.scheduledAt,
      sendNewsletter: updatePostBody.shape.sendNewsletter,
      postPreview: updatePostBody.shape.postPreview,
      categories: updatePostBody.shape.categories,
    },
    {
      title: "Update post",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      const { id, slug, ...body } = params;

      if (id && slug) {
        return error("Provide either id or slug, not both");
      }
      if (!id && !slug) {
        return error("Provide either id or slug");
      }

      try {
        const api = getApi();
        const result = id
          ? await api.posts.update({ id, ...body })
          : await api.posts.update({ slug: slug!, ...body });
        return json(result);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "delete-post",
    "Permanently delete a post by ID or slug. This action is irreversible. Always confirm with the user before deleting. Requires API key.",
    {
      id: z.string().min(1).optional().describe("Post ID"),
      slug: z.string().min(1).optional().describe("Post slug"),
    },
    {
      title: "Delete post",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
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
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );

  server.tool(
    "send-test-email",
    "Send a test newsletter email for a draft post to the publication owner. Only works for draft posts. Requires API key.",
    {
      id: sendTestEmailParams.shape.postId.describe("Post ID"),
    },
    {
      title: "Send test email",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.posts.sendTestEmail({ id: params.id });
        return json(result);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );
}
