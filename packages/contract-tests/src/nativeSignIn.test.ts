import { createHash } from "node:crypto";

import { allowedRedirect } from "#mock/handlers/nativeSignIn";

import { control, postJson, serve } from "./harness";

const REDIRECT = "com.therabbithole.app.apple.sneakers-pam:/oauth2redirect";
const VERIFIER = "a-long-enough-pkce-verifier-for-the-mock-sign-in";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

describe("native sign-in, as gateway#143 proposes it", () => {
  let base: string;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ base, stop } = await serve());
  });
  afterAll(() => stop());
  beforeEach(() => control(base, { kind: "fresh" }));

  const authorize = (parameters: Record<string, string> = {}) => {
    const query = new URLSearchParams({
      client_id: "sneakers-ios",
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
      redirect_uri: REDIRECT,
      response_type: "code",
      state: "xyz",
      ...parameters,
    });
    return fetch(`${base}/oauth2/authorize?${query.toString()}`, { redirect: "manual" });
  };

  const signInPage = async () => {
    const link = /href="([^"]+mock-user-alice)"/.exec(await (await authorize()).text())?.[1];
    return fetch(`${base}${(link ?? "").replaceAll("&amp;", "&")}`, { redirect: "manual" });
  };

  const token = (fields: Record<string, string>) =>
    fetch(`${base}/oauth2/token`, { body: new URLSearchParams(fields), method: "POST" });

  const code = async () =>
    new URL((await signInPage()).headers.get("location") ?? "").searchParams.get("code") ?? "";

  const exchange = async (verifier = VERIFIER) =>
    token({
      client_id: "sneakers-ios",
      code: await code(),
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT,
    });

  it("publishes its endpoints under the address it was reached on", async () => {
    const metadata = (await (
      await fetch(`${base}/.well-known/oauth-authorization-server`)
    ).json()) as Record<string, unknown>;
    expect(metadata.issuer).toBe(base);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("hands the code back on the app's redirect, with its state", async () => {
    const location = (await signInPage()).headers.get("location") ?? "";
    expect(location.startsWith(`${REDIRECT}?`)).toBe(true);
    expect(new URL(location).searchParams.get("state")).toBe("xyz");
  });

  it("swaps the code for tokens that call the API with no cookie or CSRF header", async () => {
    const body = (await (await exchange()).json()) as { access_token: string; token_type: string };
    expect(body.token_type).toBe("Bearer");
    const answer = await postJson(
      `${base}/graphql`,
      { operationName: "RequestsList", query: "query RequestsList { approvalRequests { id } }" },
      { Authorization: `Bearer ${body.access_token}` },
    );
    expect(answer.status).toBe(200);
  });

  it("refuses a wrong verifier", async () => {
    const answer = await exchange("not-the-verifier");
    expect([answer.status, await answer.json()]).toEqual([400, { error: "invalid_grant" }]);
  });

  it("spends a code once", async () => {
    const once = await code();
    const fields = {
      client_id: "sneakers-ios",
      code: once,
      code_verifier: VERIFIER,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT,
    };
    expect((await token(fields)).status).toBe(200);
    expect((await token(fields)).status).toBe(400);
  });

  it("rotates the refresh token", async () => {
    const first = (await (await exchange()).json()) as { refresh_token: string };
    const fields = {
      client_id: "sneakers-ios",
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
    };
    expect((await token(fields)).status).toBe(200);
    expect((await token(fields)).status).toBe(400);
  });

  it("requires PKCE S256", async () => {
    const answer = await authorize({ code_challenge_method: "plain" });
    expect(answer.status).toBe(302);
    expect(answer.headers.get("location")).toContain("error=invalid_request");
  });

  it("refuses a redirect the client didn't register", async () => {
    expect((await authorize({ redirect_uri: `${REDIRECT}/extra` })).status).toBe(400);
    expect((await authorize({ client_id: "nobody" })).status).toBe(400);
  });

  it.each([
    // eslint-disable-next-line unicorn/prefer-https -- plain http off loopback is the case
    "http://example.org/callback",
    "myapp:/callback",
    "com.example.app://host/callback",
    "https://example.org/*",
    "https://user@example.org/callback",
    "https://example.org/callback#frag",
    "not a url",
  ])("refuses to register %s", (uri) => {
    expect(allowedRedirect(uri)).toBe(false);
  });

  it.each([
    "http://127.0.0.1:4242/callback",
    "http://localhost/callback",
    "com.example.app:/oauth2redirect",
    "https://example.org/callback",
  ])("accepts %s", (uri) => {
    expect(allowedRedirect(uri)).toBe(true);
  });

  it("registers a third-party client under the same rules", async () => {
    const good = await postJson(`${base}/oauth2/register`, {
      client_name: "Third party",
      redirect_uris: ["com.example.app:/cb"],
    });
    expect(good.status).toBe(201);
    const bad = await postJson(`${base}/oauth2/register`, { redirect_uris: ["myapp:/cb"] });
    expect([bad.status, await bad.json()]).toEqual([400, { error: "invalid_redirect_uri" }]);
  });
});
