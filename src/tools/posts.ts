import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { error, json, stripHeavyContent } from "./helpers.js";

export function registerPostTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "get-post",
    "Get a single post by ID, or by publication slug + post slug",
    {
      id: z.string().min(1).optional().describe("Post ID"),
      publicationSlug: z
        .string()
        .min(1)
        .optional()
        .describe("Publication slug (use with postSlug)"),
      postSlug: z
        .string()
        .min(1)
        .optional()
        .describe("Post slug (use with publicationSlug)"),
      includeContent: z
        .boolean()
        .optional()
        .default(true)
        .describe("Include post content as markdown (default: true)"),
    },
    {
      title: "Get post",
      readOnlyHint: true,
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
    "List posts from a publication by publication ID, or list your own posts (requires API key). Supports pagination and status filtering.",
    {
      publicationId: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Publication ID to list posts from. Omit to list your own posts (requires API key)."
        ),
      status: z
        .enum(["published", "draft"])
        .optional()
        .describe("Filter by status (only for own posts)"),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(10)
        .describe("Number of posts to return (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor"),
      includeContent: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include post content as markdown (default: false)"),
    },
    {
      title: "List posts",
      readOnlyHint: true,
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

        // List own posts (requires API key)
        const { items, pagination } = await api.posts.list({
          status: params.status,
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
    "Create a new draft post in your publication. Requires API key. Content must be in markdown format. Do not set sendNewsletter to true without explicit user approval — it emails all subscribers and cannot be undone.",
    {
      title: z.string().min(1).describe("Post title"),
      markdown: z.string().min(1).describe("Post content in markdown format"),
      subtitle: z.string().optional().describe("Post subtitle"),
      slug: z.string().optional().describe("Custom URL slug for the post"),
      imageUrl: z.string().optional().describe("Cover image URL"),
      postPreview: z
        .string()
        .optional()
        .describe("Preview text shown in feeds"),
      categories: z
        .array(z.string())
        .optional()
        .describe("Post tags/categories"),
      sendNewsletter: z
        .boolean()
        .optional()
        .describe("Send as newsletter to subscribers"),
    },
    {
      title: "Create post",
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: false,
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
    "Update an existing post by ID or slug. Only provided fields are updated. Requires API key. Setting status to 'published' makes the post publicly visible — always confirm with the user before publishing.",
    {
      id: z
        .string()
        .min(1)
        .optional()
        .describe("Post ID (use id or slug, not both)"),
      slug: z
        .string()
        .min(1)
        .optional()
        .describe("Post slug (use id or slug, not both)"),
      title: z.string().optional().describe("New title"),
      markdown: z
        .string()
        .optional()
        .describe("New content in markdown format"),
      subtitle: z.string().optional().describe("New subtitle"),
      status: z
        .enum(["published", "draft", "archived"])
        .optional()
        .describe("Change post status"),
      imageUrl: z.string().optional().describe("New cover image URL"),
    },
    {
      title: "Update post",
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: true,
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
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: false,
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
      id: z.string().min(1).describe("Post ID"),
    },
    {
      title: "Send test email",
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: false,
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
