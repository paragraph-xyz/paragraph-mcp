import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  archiveContentParams,
  createContentBody,
  getContentByIdParams,
  listContentQueryParams,
  restoreContentParams,
  updateContentBody,
  updateContentParams,
} from "@paragraph-com/sdk/zod";
import { json, toError } from "./helpers.js";

const CREATE_CONTENT_DESCRIPTION = `
Save a finished piece of short-form content to the publication's library — an X post or thread, a LinkedIn post, a one-off email, or an X Article.

**This drafts, it does not send.** The piece shows up in the Paragraph app under Content, where the writer edits and sends it. Nothing is posted to X or LinkedIn, emailed, or scheduled by this tool. Say that when you report back; don't imply the piece went out.

**Do NOT use this for a full Paragraph post.** A post is long-form writing that lives on the publication's website and can go out as a newsletter — that's \`create-post\`. This tool is the short-form library: what the writer sees under Socials and Emails. If the user asks for "a post" and means an X or LinkedIn post, this is the right tool; if they mean an article on their blog, it isn't.

**The body takes the shape its kind uses:**
- \`tweet\` — \`text\` for a single post, or \`tweets\` for a thread (never both). One entry per tweet, in posting order, each at most 280 characters. Never concatenate a thread into one entry.
- \`linkedin\` — \`text\`.
- \`newsletter\` — \`subject\`, \`body\`, and an optional \`preheader\`.
- \`x_article\` — \`title\` (the headline X publishes), \`body\` as CommonMark markdown, and an optional \`canonicalUrl\`.

It's validated the same way the Paragraph app validates it, so a thread over 280 characters an entry, or an Article missing its headline, comes back with the same explanation the writer would see in the app. Fix the draft and retry.

**Text only.** Media has to be uploaded to X or LinkedIn first, which the API can't do yet — sending \`media\` is rejected. If the user wants an image, tell them to add it to the draft in the app.

**Group it with the post it came from.** When this piece is a version of a Paragraph post — a thread drawn from it, a LinkedIn version, the newsletter — call \`create-post-content-bucket\` with that post's id and pass the \`bucketId\` it returns. The writer then sees the post and everything made from it as one row under Content instead of unrelated drafts. Omit it for standalone work.

Requires API key.
`.trim();

const UPDATE_CONTENT_DESCRIPTION = `
Rename a piece of content, replace its body, or both. Requires API key.

**Read before you write.** Call \`get-content\` first: the draft may have changed in the app since you last saw it, and \`body\` replaces the artifact entirely — in the same shape the kind takes on create. Send the whole thing, not just the part that changed. Media already attached to the draft is the one exception: you can't send it back, so it's carried over rather than dropped.

**Scheduled pieces are locked.** If a send is queued or already running, its words go out exactly as written, so an edit to \`body\` is refused with an explanation. Tell the user to cancel the schedule in the app first. Renaming is always allowed — a title isn't published anywhere.

\`bucketId\` groups this piece with the post it was made from, for a draft created before the group existed. A piece already grouped with a different post is refused rather than moved; tell the user to ungroup it in the app.

Provide at least one of \`title\`, \`body\`, or \`bucketId\`.
`.trim();

export function registerContentTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "create-content",
    {
      title: "Create content draft",
      description: CREATE_CONTENT_DESCRIPTION,
      inputSchema: {
        kind: createContentBody.shape.kind,
        title: createContentBody.shape.title,
        body: createContentBody.shape.body,
        bucketId: createContentBody.shape.bucketId,
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
        const result = await api.content.create(params);
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "list-content",
    {
      title: "List content",
      description:
        "List the short-form content in your publication's library — X posts, LinkedIn posts, one-off emails, and X Articles — newest activity first. Filter with `kind` and `status`. `status` defaults to `all`, which is everything except the pieces the writer archived; a piece that was delivered stays listed whether or not it was archived afterwards. Bodies aren't included — call `get-content` to read one. Requires API key.",
      inputSchema: {
        kind: listContentQueryParams.shape.kind,
        status: listContentQueryParams.shape.status,
        limit: listContentQueryParams.shape.limit.describe(
          "Number of pieces to return (1-50, default: 20). Keep this small to avoid oversized responses — use pagination to retrieve more."
        ),
        cursor: listContentQueryParams.shape.cursor,
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
        const result = await api.content.list({
          kind: params.kind,
          status: params.status,
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
    "get-content",
    {
      title: "Get content",
      description:
        "Get one piece of drafted content with its body. Read it before editing so you rewrite what's actually saved — the draft may have changed in the app. `lockedReason` says why the piece can't be edited right now, or is null when it can. Requires API key.",
      inputSchema: {
        contentId: getContentByIdParams.shape.contentId,
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
        const result = await api.content.get({ id: params.contentId });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "update-content",
    {
      title: "Update content",
      description: UPDATE_CONTENT_DESCRIPTION,
      inputSchema: {
        contentId: updateContentParams.shape.contentId,
        title: updateContentBody.shape.title,
        body: updateContentBody.shape.body,
        bucketId: updateContentBody.shape.bucketId,
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
        const result = await api.content.update({
          id: params.contentId,
          ...(params.title !== undefined ? { title: params.title } : {}),
          ...(params.body !== undefined ? { body: params.body } : {}),
          ...(params.bucketId !== undefined
            ? { bucketId: params.bucketId }
            : {}),
        });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "archive-content",
    {
      title: "Archive content",
      description:
        "Put a piece away without deleting it. Archived content drops out of the default `list-content` results and out of the writer's Content surface, and `restore-content` brings it back. Any suggestion still proposing the piece is dismissed along with it. A piece with a send already queued can't be archived — tell the user to cancel the schedule in the app first. Requires API key.",
      inputSchema: {
        contentId: archiveContentParams.shape.contentId,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.content.archive({ id: params.contentId });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "restore-content",
    {
      title: "Restore content",
      description:
        "Bring an archived piece back into the library. Suggestions dismissed when it was archived stay dismissed — the writer gets the draft back, not the to-do items telling them to ship it. Use `list-content` with `status: \"archived\"` to find the piece. Requires API key.",
      inputSchema: {
        contentId: restoreContentParams.shape.contentId,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const api = getApi();
        const result = await api.content.restore({ id: params.contentId });
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
