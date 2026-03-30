import OAuthProvider, {
  type OAuthHelpers,
  type AuthRequest,
} from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ParagraphAPI } from "@paragraph-com/sdk";
import { Hono } from "hono";
import { registerTools } from "./tools/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Env {
  OAUTH_KV: KVNamespace;
  COOKIE_ENCRYPTION_KEY: string;
  PARAGRAPH_API_URL?: string;
}

interface Props {
  apiKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PARAGRAPH_API = "https://api.paragraph.com";
const PARAGRAPH_FRONTEND = "https://paragraph.com";
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 120; // 3 minutes max

function paragraphApi(env: Env) {
  return env.PARAGRAPH_API_URL?.trim() || PARAGRAPH_API;
}

// ---------------------------------------------------------------------------
// MCP handler (stateless — new server per request)
// ---------------------------------------------------------------------------

const mcpHandler = {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    // Only POST is meaningful for stateless Streamable HTTP
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Extract API key from OAuth props injected by OAuthProvider
    const props = (request as Request & { props?: Props }).props;
    if (!props?.apiKey) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Create a fresh MCP server + transport per request (stateless)
    const server = new McpServer({ name: "Paragraph", version: "0.1.0" });

    let api: ParagraphAPI | null = null;
    const getApi = () => {
      if (!api) {
        api = new ParagraphAPI({ apiKey: props.apiKey });
      }
      return api;
    };

    registerTools(server, getApi);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  },
};

// ---------------------------------------------------------------------------
// Auth handler (Hono app for /authorize and /callback)
// ---------------------------------------------------------------------------

type AuthEnv = { Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } };

const authApp = new Hono<AuthEnv>();

/**
 * GET /authorize
 *
 * Called by the MCP client (e.g. Claude) to start the OAuth flow.
 * 1. Parse the OAuth authorize request
 * 2. Create a device auth session on Paragraph's API
 * 3. Store the OAuth request state in KV (keyed by session ID)
 * 4. Redirect user to Paragraph's approval page
 */
authApp.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  if (!oauthReqInfo.clientId) {
    return c.text("Invalid OAuth request", 400);
  }

  const apiBase = paragraphApi(c.env);
  const workerOrigin = new URL(c.req.url).origin;

  // Create device auth session with a callbackUrl.
  // The callbackUrl includes the Worker's /callback endpoint. Since we don't
  // know the sessionId yet, we use a placeholder that the frontend will replace
  // — or more simply, we include the base URL and the frontend appends the
  // session from its own context.
  const callbackBase = `${workerOrigin}/callback`;
  const sessionRes = await fetch(`${apiBase}/api/v1/api/auth/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceName: "Claude MCP",
      callbackUrl: callbackBase,
    }),
  });

  if (!sessionRes.ok) {
    return c.text("Failed to create auth session", 502);
  }

  const session = (await sessionRes.json()) as {
    sessionId: string;
    verificationUrl: string;
    expiresAt: string;
  };

  // Store the OAuth request in KV so /callback can complete authorization
  await c.env.OAUTH_KV.put(
    `mcp_auth:${session.sessionId}`,
    JSON.stringify(oauthReqInfo),
    { expirationTtl: 600 } // 10 minutes
  );

  // Redirect user to Paragraph's approval page
  const approvalUrl = `${PARAGRAPH_FRONTEND}/api/auth?session=${session.sessionId}`;

  return c.redirect(approvalUrl);
});

/**
 * GET /callback
 *
 * After the user approves on Paragraph, they're redirected here.
 * 1. Poll the session until status is "completed"
 * 2. Extract the API key
 * 3. Complete the OAuth authorization
 */
authApp.get("/callback", async (c) => {
  const sessionId = c.req.query("session");
  if (!sessionId) {
    return c.text("Missing session parameter", 400);
  }

  // Retrieve stored OAuth request
  const stored = await c.env.OAUTH_KV.get(`mcp_auth:${sessionId}`);
  if (!stored) {
    return c.text("Session expired or not found", 400);
  }
  const oauthReqInfo = JSON.parse(stored) as AuthRequest;

  // Poll Paragraph's session endpoint for the API key
  const apiBase = paragraphApi(c.env);
  let apiKey: string | null = null;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(
      `${apiBase}/api/v1/api/auth/sessions/${sessionId}`
    );
    if (!res.ok) break;

    const data = (await res.json()) as {
      status: string;
      apiKey?: string;
    };

    if (data.status === "completed" && data.apiKey) {
      apiKey = data.apiKey;
      break;
    }

    if (data.status === "expired") {
      return c.text("Session expired. Please try again.", 400);
    }

    // Wait before next poll
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!apiKey) {
    return c.text("Authorization timed out. Please try again.", 408);
  }

  // Clean up KV
  await c.env.OAUTH_KV.delete(`mcp_auth:${sessionId}`);

  // Complete the OAuth flow — this issues the token to the MCP client
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: sessionId,
    metadata: {},
    scope: oauthReqInfo.scope || [],
    props: { apiKey } satisfies Props,
  });

  return c.redirect(redirectTo);
});

// ---------------------------------------------------------------------------
// Export: OAuthProvider wrapping everything
// ---------------------------------------------------------------------------

type EnvWithOAuth = Env & { OAUTH_PROVIDER: OAuthHelpers };

export default new OAuthProvider<EnvWithOAuth>({
  apiRoute: "/mcp",
  apiHandler: mcpHandler as Pick<Required<ExportedHandler<EnvWithOAuth>>, "fetch">,
  defaultHandler: {
    fetch(request: Request, env: EnvWithOAuth, ctx: ExecutionContext) {
      return authApp.fetch(request, env, ctx);
    },
  },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
