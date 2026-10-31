import { control, gql, postJson, serve, signIn } from "./harness";

describe("the iOS app's sign-in and session calls", () => {
  let base: string;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ base, stop } = await serve());
  });
  afterAll(() => stop());
  beforeEach(() => control(base, { kind: "fresh" }));

  it("announces itself on /livez in a version the app can parse", async () => {
    const live = await fetch(`${base}/livez`);
    expect(live.status).toBe(200);
    expect(live.headers.get("Sneakers-Version")).toMatch(/^v\d+\.\d+\.\d+/);
    expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ status: "ok" });
  });

  it("signs in with a second factor and sets the live cookie name", async () => {
    const alice = await signIn(base, "alice");
    expect(alice.cookie).toMatch(/^sneakers_sid=/);
    expect(alice.userId).toBe("mock-user-alice");
  });

  it("restores a session from the stored cookie", async () => {
    const alice = await signIn(base, "alice");
    const answer = await fetch(`${base}/auth/session`, { headers: { Cookie: alice.cookie } });
    expect(await answer.json()).toMatchObject({
      authenticated: true,
      csrfToken: alice.csrf,
      userId: alice.userId,
    });
  });

  it("refuses a wrong password shape, a wrong code and a disabled account as the app expects", async () => {
    const login = await postJson(`${base}/auth/login`, { password: "", username: "alice" });
    expect([login.status, await login.json()]).toEqual([401, { error: "invalid_credentials" }]);
    const disabled = await postJson(`${base}/auth/login`, { password: "x", username: "erin" });
    expect([disabled.status, await disabled.json()]).toEqual([403, { error: "account_disabled" }]);
    const first = await (
      await postJson(`${base}/auth/login`, { password: "x", username: "alice" })
    ).json();
    const wrong = await postJson(`${base}/auth/verify-otp`, {
      code: "000000",
      kind: "totp",
      pendingId: (first as { pendingId: string }).pendingId,
    });
    expect([wrong.status, await wrong.json()]).toEqual([401, { error: "invalid_code" }]);
  });

  it("sends and takes a step-up", async () => {
    const alice = await signIn(base, "alice");
    const headers = { Cookie: alice.cookie, "X-CSRF-Token": alice.csrf };
    const send = await postJson(`${base}/auth/mfa/step-up/email/send`, {}, headers);
    expect(send.status).toBe(200);
    const stepUp = await postJson(
      `${base}/auth/mfa/step-up`,
      { code: "123456", kind: "email" },
      headers,
    );
    expect(stepUp.status).toBe(200);
  });

  it("ends the session on sign-out, for GraphQL as well", async () => {
    const alice = await signIn(base, "alice");
    const out = await postJson(
      `${base}/auth/logout`,
      {},
      { Cookie: alice.cookie, "X-CSRF-Token": alice.csrf },
    );
    expect(out.status).toBe(200);
    expect((await gql(base, alice, "query RequestsList { approvalRequests { id } }")).status).toBe(
      401,
    );
  });
});
