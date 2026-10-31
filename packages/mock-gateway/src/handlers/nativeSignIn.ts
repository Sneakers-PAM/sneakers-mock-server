import { http, HttpResponse } from "msw";
import { createHash } from "node:crypto";

import { noteFor, userById, USERS } from "#mock/fixtures/users";
import { mintSession, sessionOf } from "#mock/handlers/auth";
import { accessTokens } from "#mock/handlers/bearer";
import {
  MOCK_GATEWAY_URL,
  MOCK_ORIGIN_HEADER,
  type MockSession,
  newToken,
  onMockReset,
} from "#mock/state";

/*
 * Native sign-in: the authorization code flow with PKCE S256 the gateway runs today for the MCP
 * server and the CLI, plus the redirect rules and refresh tokens proposed in
 * Sneakers-PAM/sneakers-gateway#143, which the gateway hasn't shipped. When it does, this file
 * moves to match it. A browser session stands in for the real sign-in page: it lists the cast.
 */

const ACCESS_TOKEN_S = 900;
const CODE_MS = 60_000;

/** The first-party iOS app, which the gateway will register itself (#143). */
export const FIRST_PARTY_CLIENTS: MockClient[] = [
  {
    id: "sneakers-ios",
    name: "Sneakers for iOS",
    redirectUris: ["com.therabbithole.app.apple.sneakers-pam:/oauth2redirect"],
  },
];

interface Grant {
  challenge: string;
  clientId: string;
  expiresAt: number;
  redirectUri: string;
  userId: string;
}

interface MockClient {
  id: string;
  name: string;
  redirectUris: string[];
}

interface Pending {
  challenge: string;
  clientId: string;
  redirectUri: string;
  state: string;
}

const native = {
  clients: new Map<string, MockClient>(),
  codes: new Map<string, Grant>(),
  pending: new Map<string, Pending>(),
  refreshTokens: new Map<string, { clientId: string; session: MockSession }>(),
};

onMockReset(() => {
  accessTokens.clear();
  native.clients.clear();
  native.codes.clear();
  native.pending.clear();
  native.refreshTokens.clear();
});

const at = (path: string) => `${MOCK_GATEWAY_URL}${path}`;
const refuse = (error: string, status = 400) =>
  HttpResponse.json({ error }, { headers: { "Cache-Control": "no-store" }, status });

const parsed = (raw: string): null | URL => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

const isLoopback = (u: URL) =>
  u.protocol === "http:" && ["[::1]", "127.0.0.1", "localhost"].includes(u.hostname);

/** A reverse-domain private-use scheme (com.example.app:/path), the only custom kind #143 allows. */
const isPrivateUse = (u: URL) =>
  /^[a-z][\d+a-z-]*(\.[\d+a-z-]+)+:$/.test(u.protocol) && !u.host && u.pathname.startsWith("/");

/** The shapes a native redirect may take: no wildcards, no fragment, no user info. */
export const allowedRedirect = (raw: string): boolean => {
  const u = parsed(raw);
  if (!u || u.hash || u.username || u.password || raw.includes("*")) return false;
  return isLoopback(u) || isPrivateUse(u) || u.protocol === "https:";
};

/** Loopback ignores the port, which a native client picks per sign-in; the rest match exactly. */
const matches = (registered: string, got: string): boolean => {
  if (registered === got) return true;
  const a = parsed(registered);
  const b = parsed(got);
  return (
    !!a &&
    !!b &&
    isLoopback(a) &&
    isLoopback(b) &&
    a.hostname === b.hostname &&
    a.pathname === b.pathname
  );
};

const clientOf = (id: null | string): MockClient | undefined =>
  FIRST_PARTY_CLIENTS.find((c) => c.id === id) ?? native.clients.get(id ?? "");

const withQuery = (target: string, values: Record<string, string>): string => {
  const url = new URL(target);
  for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
  return url.toString();
};

const redirect = (location: string) =>
  new HttpResponse(null, { headers: { location }, status: 302 });

const issueCode = (p: Pending, userId: string) => {
  const code = newToken("mock-code");
  native.codes.set(code, {
    challenge: p.challenge,
    clientId: p.clientId,
    expiresAt: Date.now() + CODE_MS,
    redirectUri: p.redirectUri,
    userId,
  });
  return redirect(withQuery(p.redirectUri, { code, state: p.state }));
};

const signInPage = (id: string, clientName: string) => {
  const rows = USERS.filter((u) => !u.disabled)
    .map(
      (u) =>
        `<p><a href="/oauth2/mock-sign-in?req=${id}&amp;user=${u.id}">${u.name}</a> (${noteFor(u)})</p>`,
    )
    .join("");
  return new HttpResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mock sign-in</title></head><body style="font:16px system-ui;margin:2rem"><h1>Sign in to ${clientName}</h1><p>MOCK DATA, not a real server.</p>${rows}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};

const tokens = (session: MockSession, clientId: string) => {
  const accessToken = newToken("mock-access");
  const refreshToken = newToken("mock-refresh");
  accessTokens.set(accessToken, { expiresAt: Date.now() + ACCESS_TOKEN_S * 1000, session });
  native.refreshTokens.set(refreshToken, { clientId, session });
  return HttpResponse.json(
    {
      access_token: accessToken,
      expires_in: ACCESS_TOKEN_S,
      refresh_token: refreshToken,
      token_type: "Bearer",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export const nativeSignInHandlers = [
  http.get(at("/.well-known/oauth-authorization-server"), ({ request }) => {
    const base = request.headers.get(MOCK_ORIGIN_HEADER) ?? MOCK_GATEWAY_URL;
    return HttpResponse.json({
      authorization_endpoint: `${base}/oauth2/authorize`,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      issuer: base,
      registration_endpoint: `${base}/oauth2/register`,
      response_types_supported: ["code"],
      token_endpoint: `${base}/oauth2/token`,
      token_endpoint_auth_methods_supported: ["none"],
    });
  }),

  http.post(at("/oauth2/register"), async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      client_name?: string;
      redirect_uris?: string[];
    };
    const uris = body.redirect_uris ?? [];
    if (uris.length === 0 || uris.length > 10) return refuse("invalid_client_metadata");
    if (!uris.every((u) => allowedRedirect(u))) return refuse("invalid_redirect_uri");
    const client = {
      id: newToken("snkc"),
      name: body.client_name?.trim() || "Native client",
      redirectUris: uris,
    };
    native.clients.set(client.id, client);
    return HttpResponse.json(
      {
        client_id: client.id,
        client_name: client.name,
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: uris,
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201 },
    );
  }),

  http.get(at("/oauth2/authorize"), ({ request }) => {
    const q = new URL(request.url).searchParams;
    const client = clientOf(q.get("client_id"));
    const redirectUri = q.get("redirect_uri") ?? "";
    if (!client || !client.redirectUris.some((u) => matches(u, redirectUri)))
      return new HttpResponse("unknown client or redirect_uri", { status: 400 });
    const state = q.get("state") ?? "";
    if (
      q.get("response_type") !== "code" ||
      !q.get("code_challenge") ||
      q.get("code_challenge_method") !== "S256"
    )
      return redirect(withQuery(redirectUri, { error: "invalid_request", state }));
    const pending: Pending = {
      challenge: q.get("code_challenge") ?? "",
      clientId: client.id,
      redirectUri,
      state,
    };
    const session = sessionOf(request);
    if (session) return issueCode(pending, session.userId);
    const id = newToken("mock-oauth-req");
    native.pending.set(id, pending);
    return signInPage(id, client.name);
  }),

  http.get(at("/oauth2/mock-sign-in"), ({ request }) => {
    const q = new URL(request.url).searchParams;
    const id = q.get("req") ?? "";
    const pending = native.pending.get(id);
    const user = userById(q.get("user") ?? "");
    if (!pending || !user || user.disabled)
      return new HttpResponse("the sign-in has expired", { status: 400 });
    native.pending.delete(id);
    return issueCode(pending, user.id);
  }),

  http.post(at("/oauth2/token"), async ({ request }) => {
    const form = new URLSearchParams(await request.text());
    const grantType = form.get("grant_type");
    if (grantType === "refresh_token") {
      const presented = form.get("refresh_token") ?? "";
      const held = native.refreshTokens.get(presented);
      if (!held || held.clientId !== form.get("client_id")) return refuse("invalid_grant");
      native.refreshTokens.delete(presented);
      return tokens(held.session, held.clientId);
    }
    if (grantType !== "authorization_code") return refuse("unsupported_grant_type");
    const code = form.get("code") ?? "";
    const grant = native.codes.get(code);
    native.codes.delete(code);
    if (
      !grant ||
      grant.expiresAt <= Date.now() ||
      grant.clientId !== form.get("client_id") ||
      grant.redirectUri !== form.get("redirect_uri") ||
      s256(form.get("code_verifier") ?? "") !== grant.challenge
    )
      return refuse("invalid_grant");
    const { session } = mintSession(grant.userId, true);
    session.mfaVerifiedAt = Date.now();
    return tokens(session, grant.clientId);
  }),
];
