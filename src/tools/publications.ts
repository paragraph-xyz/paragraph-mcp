import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { error, json } from "./helpers.js";

export function registerPublicationTools(
  server: McpServer,
  getApi: () => ParagraphAPI
) {
  server.tool(
    "get-publication",
    "Get metadata about a Paragraph publication by ID, slug, or custom domain",
    {
      id: z.string().min(1).optional().describe("Publication ID"),
      slug: z
        .string()
        .min(1)
        .optional()
        .describe("Publication slug (e.g. '@myblog')"),
      domain: z
        .string()
        .min(1)
        .optional()
        .describe("Publication custom domain (e.g. 'blog.example.com')"),
    },
    {
      title: "Get publication",
      readOnlyHint: true,
      openWorldHint: false,
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
        let identifier: { id: string } | { slug: string } | { domain: string };

        if (params.id) identifier = { id: params.id };
        else if (params.slug) identifier = { slug: params.slug };
        else identifier = { domain: params.domain! };

        const publication = await api.publications.get(identifier).single();
        return json(publication);
      } catch (err) {
        return error(String(err instanceof Error ? err.message : err));
      }
    }
  );
}
