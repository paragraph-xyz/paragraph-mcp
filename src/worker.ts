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
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method !== "POST") {
      console.warn("[mcp] rejected non-POST request", {
        method: request.method,
      });
      return new Response("Method not allowed", { status: 405 });
    }

    const props = (ctx as ExecutionContext & { props?: Props }).props;
    if (!props?.apiKey) {
      console.error("[mcp] no apiKey in OAuth props — token may be invalid");
      return new Response("Unauthorized", { status: 401 });
    }

    try {
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
    } catch (err) {
      console.error("[mcp] handler error", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return new Response("Internal server error", { status: 500 });
    }
  },
};

// ---------------------------------------------------------------------------
// Auth handler (Hono app for /authorize and /callback)
// ---------------------------------------------------------------------------

type AuthEnv = { Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } };

const authApp = new Hono<AuthEnv>();

authApp.onError((err, c) => {
  console.error("[auth] unhandled error", {
    path: c.req.path,
    method: c.req.method,
    error: err.message,
    stack: err.stack,
  });
  return c.text("Internal server error", 500);
});

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
  console.log("[authorize] starting OAuth flow");

  let oauthReqInfo: Awaited<
    ReturnType<OAuthHelpers["parseAuthRequest"]>
  >;
  try {
    oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  } catch (err) {
    console.error("[authorize] failed to parse OAuth request", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.text("Invalid OAuth request", 400);
  }

  if (!oauthReqInfo.clientId) {
    console.error("[authorize] missing clientId in OAuth request");
    return c.text("Invalid OAuth request", 400);
  }

  console.log("[authorize] parsed OAuth request", {
    clientId: oauthReqInfo.clientId,
    responseType: oauthReqInfo.responseType,
    redirectUri: oauthReqInfo.redirectUri,
  });

  const apiBase = paragraphApi(c.env);
  const workerOrigin = new URL(c.req.url).origin;
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
    const body = await sessionRes.text().catch(() => "");
    console.error("[authorize] failed to create session", {
      status: sessionRes.status,
      body,
    });
    return c.text("Failed to create auth session", 502);
  }

  const session = (await sessionRes.json()) as {
    sessionId: string;
    verificationUrl: string;
    expiresAt: string;
  };

  console.log("[authorize] session created", {
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
  });

  await c.env.OAUTH_KV.put(
    `mcp_auth:${session.sessionId}`,
    JSON.stringify(oauthReqInfo),
    { expirationTtl: 600 }
  );

  const approvalUrl = `${PARAGRAPH_FRONTEND}/api/auth?session=${session.sessionId}`;
  console.log("[authorize] redirecting to approval page", { approvalUrl });

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
    console.error("[callback] missing session query param");
    return c.text("Missing session parameter", 400);
  }

  console.log("[callback] starting", { sessionId });

  const stored = await c.env.OAUTH_KV.get(`mcp_auth:${sessionId}`);
  if (!stored) {
    console.error("[callback] KV lookup failed — session expired or missing", {
      sessionId,
    });
    return c.text("Session expired or not found", 400);
  }

  let oauthReqInfo: AuthRequest;
  try {
    oauthReqInfo = JSON.parse(stored) as AuthRequest;
  } catch (err) {
    console.error("[callback] failed to parse stored OAuth request", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.text("Corrupted session data", 500);
  }

  console.log("[callback] retrieved OAuth state from KV", {
    sessionId,
    clientId: oauthReqInfo.clientId,
    redirectUri: oauthReqInfo.redirectUri,
  });

  const apiBase = paragraphApi(c.env);
  let apiKey: string | null = null;
  let lastStatus: string | null = null;
  let lastHttpStatus: number | null = null;
  let pollCount = 0;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    pollCount = attempt + 1;
    let res: Response;
    try {
      res = await fetch(
        `${apiBase}/api/v1/api/auth/sessions/${sessionId}`
      );
    } catch (err) {
      console.error("[callback] fetch error during poll", {
        sessionId,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }

    lastHttpStatus = res.status;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[callback] non-OK response from session poll", {
        sessionId,
        attempt,
        status: res.status,
        body,
      });
      break;
    }

    const data = (await res.json()) as {
      status: string;
      apiKey?: string;
    };

    lastStatus = data.status;

    if (data.status === "completed" && data.apiKey) {
      apiKey = data.apiKey;
      console.log("[callback] got API key", {
        sessionId,
        attempt,
        keyPrefix: data.apiKey.slice(0, 8),
      });
      break;
    }

    if (data.status === "expired") {
      console.warn("[callback] session expired during poll", {
        sessionId,
        attempt,
      });
      return c.text("Session expired. Please try again.", 400);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!apiKey) {
    console.error("[callback] failed to obtain API key", {
      sessionId,
      pollCount,
      lastStatus,
      lastHttpStatus,
    });
    return c.text("Authorization timed out. Please try again.", 408);
  }

  await c.env.OAUTH_KV.delete(`mcp_auth:${sessionId}`);

  try {
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: sessionId,
      metadata: {},
      scope: oauthReqInfo.scope || [],
      props: { apiKey } satisfies Props,
    });

    console.log("[callback] OAuth flow completed, redirecting", {
      sessionId,
      redirectTo: redirectTo.slice(0, 100),
    });

    return c.redirect(redirectTo);
  } catch (err) {
    console.error("[callback] completeAuthorization failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return c.text("Failed to complete authorization. Please try again.", 500);
  }
});

// ---------------------------------------------------------------------------
// Export: OAuthProvider wrapping everything
// ---------------------------------------------------------------------------

type EnvWithOAuth = Env & { OAUTH_PROVIDER: OAuthHelpers };

const oauthProvider = new OAuthProvider<EnvWithOAuth>({
  apiRoute: "/mcp",
  apiHandler: mcpHandler as Pick<
    Required<ExportedHandler<EnvWithOAuth>>,
    "fetch"
  >,
  defaultHandler: {
    fetch(request: Request, env: EnvWithOAuth, ctx: ExecutionContext) {
      return authApp.fetch(request, env, ctx);
    },
  },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

export default {
  async fetch(
    request: Request,
    env: EnvWithOAuth,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    console.log("[worker] incoming", {
      method: request.method,
      path: url.pathname,
    });

    try {
      const response = await oauthProvider.fetch(request, env, ctx);
      console.log("[worker] response", {
        method: request.method,
        path: url.pathname,
        status: response.status,
      });
      return response;
    } catch (err) {
      console.error("[worker] unhandled error", {
        method: request.method,
        path: url.pathname,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return new Response("Internal server error", { status: 500 });
    }
  },
};
