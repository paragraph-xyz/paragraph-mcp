import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PublicationIdentifier } from "@paragraph-com/sdk";
import { ParagraphAPI } from "@paragraph-com/sdk";
import {
  getPublicationByIdParams,
  getPublicationBySlugParams,
  getPublicationByDomainParams,
  updatePublicationBody,
  updatePublicationParams,
} from "@paragraph-com/sdk/zod";
import { error, json, toError } from "./helpers.js";

export function registerPublicationTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.registerTool(
    "get-publication",
    {
      title: "Get publication",
      description:
        "Get metadata about a Paragraph publication by ID, slug, or custom domain",
      inputSchema: {
        id: getPublicationByIdParams.shape.publicationId.optional(),
        slug: getPublicationBySlugParams.shape.slug.optional(),
        domain: getPublicationByDomainParams.shape.domain.optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const provided = [params.id, params.slug, params.domain].filter(
        (v) => v !== undefined
      );
      if (provided.length !== 1) {
        return error("Provide exactly one of id, slug, or domain");
      }

      try {
        const api = getApi();
        let identifier: PublicationIdentifier;

        if (params.id) identifier = { id: params.id };
        else if (params.slug) identifier = { slug: params.slug };
        else identifier = { domain: params.domain! };

        const publication = await api.publications.get(identifier).single();
        return json(publication);
      } catch (err) {
        return toError(err);
      }
    }
  );

  server.registerTool(
    "update-publication",
    {
      title: "Update publication",
      description:
        "Update settings for the publication associated with the API key. Only provided fields are updated — omit any field you don't want to change. The `publicationId` must match the publication that owns the API key (call `get-me` to look it up). Notes: `featuredPost` accepts 'latest', 'popular', 'disabled', or a specific post ID — if you pass an ID it must belong to this publication. `pinnedPostIds` replaces the existing pinned list and is capped at 50 IDs; pinned posts render in their own section above the regular feed. `emailNotifications` is merged onto current settings — only the toggles you send change. Requires API key.",
      inputSchema: {
        publicationId: updatePublicationParams.shape.publicationId.describe(
          "Publication to update. Must match the publication that owns the API key."
        ),
        name: updatePublicationBody.shape.name,
        summary: updatePublicationBody.shape.summary,
        postListType: updatePublicationBody.shape.postListType,
        themeColor: updatePublicationBody.shape.themeColor,
        headerFont: updatePublicationBody.shape.headerFont,
        bodyFont: updatePublicationBody.shape.bodyFont,
        showMostPopular: updatePublicationBody.shape.showMostPopular,
        hideStats: updatePublicationBody.shape.hideStats,
        featuredPost: updatePublicationBody.shape.featuredPost.describe(
          "Featured post selector. Use 'latest', 'popular', 'disabled', or a post ID belonging to this publication."
        ),
        disableComments: updatePublicationBody.shape.disableComments,
        disableHighlights: updatePublicationBody.shape.disableHighlights,
        enableTableOfContents: updatePublicationBody.shape.enableTableOfContents,
        enableSubscribePopup: updatePublicationBody.shape.enableSubscribePopup,
        enableSubscribeScroll: updatePublicationBody.shape.enableSubscribeScroll,
        pinnedPostIds: updatePublicationBody.shape.pinnedPostIds.describe(
          "Ordered list of post IDs to pin to the homepage. Replaces the existing pinned list. Each ID must belong to this publication. Maximum 50."
        ),
        emailNotifications: updatePublicationBody.shape.emailNotifications.describe(
          "Owner-side email notification toggles. Merged onto existing settings — only the toggles you send change."
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const { publicationId, ...body } = params;
      try {
        const api = getApi();
        const result = await api.publications.update(publicationId, body);
        return json(result);
      } catch (err) {
        return toError(err);
      }
    }
  );
}
