import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  createPostContentBucketParams,
  getContentBucketByIdParams,
  getPostContentBucketParams,
  listContentBucketsQueryParams,
} from "@paragraph-com/sdk/zod";
import { json, toError } from "./helpers.js";

const CREATE_POST_CONTENT_BUCKET_DESCRIPTION = `
Get the content group for a post, creating it if this is the first thing made from that post. Requires API key.

A content group is one identity for a post and everything made out of it — the post, the X thread drawn from it, the LinkedIn version, the newsletter. The writer sees it as a single stacked row under Content in the Paragraph app.

**This is the first call when repurposing a post.** Seed the group here, then pass the \`bucketId\` it returns on every \`create-content\` call derived from that post. Without it the writer gets unrelated drafts that don't know about each other.

Safe to call repeatedly: a post that already has a group gets the same id back and nothing is written. A post you reopened for editing resolves to the live post's group, so a draft id and its published id give the same answer.
`.trim();

const GET_CONTENT_BUCKET_DESCRIPTION = `
Get one content group and everything already made from its post. Requires API key.

**Read this before drafting a new version**, so you don't remake something that exists. If the group already holds a \`tweet\`, the thread has been written; say so rather than writing a second one, unless the user asks for a replacement.

Each member's \`kind\` says where to read it: \`post\` with \`get-post\`, \`content\` with \`get-content\`. A \`kind\` of \`other\` is a member Paragraph groups but this API can't fetch.
`.trim();

export function registerBucketTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "list-content-buckets",
    {
      title: "List content groups",
      description:
        "List the content groups in the publication, most recently active first. Each group is a post plus everything made out of it, with its members in display order and the post first. Bodies aren't included — read a member with `get-content` or `get-post`. Requires API key.",
      inputSchema: {
        limit: listContentBucketsQueryParams.shape.limit.describe(
          "Number of groups to return (1-50, default: 20). Keep this small to avoid oversized responses — use pagination to retrieve more."
        ),
        cursor: listContentBucketsQueryParams.shape.cursor,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.buckets.list({
          limit: params.limit,
          cursor: params.cursor,
        });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "get-content-bucket",
    {
      title: "Get content group",
      description: GET_CONTENT_BUCKET_DESCRIPTION,
      inputSchema: {
        bucketId: getContentBucketByIdParams.shape.bucketId,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.buckets.get({ id: params.bucketId });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "get-post-content-bucket",
    {
      title: "Get a post's content group",
      description:
        "Find the content group a post belongs to, without creating one. Answers `null` when nothing has been made from the post yet. Use this to check whether a post has already been repurposed; use `create-post-content-bucket` when you are about to draft something from it. Requires API key.",
      inputSchema: {
        postId: getPostContentBucketParams.shape.postId,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.buckets.forPost({ postId: params.postId });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "create-post-content-bucket",
    {
      title: "Create a post's content group",
      description: CREATE_POST_CONTENT_BUCKET_DESCRIPTION,
      inputSchema: {
        postId: createPostContentBucketParams.shape.postId,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        // Returns the existing group without writing, so a repeat call is
        // genuinely the same operation rather than a second group.
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.buckets.createForPost({
          postId: params.postId,
        });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
