import { control, gql, serve, signIn } from "./harness";

const LIST = "query RequestsList { approvalRequests { id status requestedByUserId } }";
const SECRET = "mock-secret-acme-vpn";
const PREPARE = `mutation SecretPrepareReveal($secretId: ID!, $fieldKey: String!) {
  prepareSecretReveal(secretId: $secretId, fieldKey: $fieldKey) { id state }
}`;
const REDEEM = "mutation SecretRedeemReveal($id: ID!) { redeemSecretReveal(id: $id) }";
const REVEAL =
  "mutation SecretReveal($id: ID!, $fieldKey: String!) { revealSecretField(id: $id, fieldKey: $fieldKey) }";
const SECRETS = `query BrowseSecrets($folderId: String!) {
  secretsInFolder(folderId: $folderId) { id name }
}`;

describe("the mock's controls", () => {
  let base: string;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ base, stop } = await serve());
  });
  afterAll(() => stop());
  beforeEach(() => control(base, { kind: "fresh" }));

  const names = async () => {
    const alice = await signIn(base, "alice");
    const { body } = await gql(base, alice, SECRETS, { folderId: "mock-folder-platform" });
    return (body.data?.secretsInFolder as { name: string }[]).map((s) => s.name);
  };

  it("serves the controls page with no sign-in", async () => {
    const page = await fetch(`${base}/_mock`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Mock controls");
    expect((await fetch(`${base}/_mock/people`)).status).toBe(200);
    expect((await fetch(`${base}/_mock/state`)).status).toBe(200);
  });

  it("add-secret adds a secret the apps then list", async () => {
    const { body } = await control(base, { kind: "add-secret", name: "Fresh one" });
    expect(body.created).toEqual(expect.stringMatching(/^mock-secret/));
    expect(await names()).toContain("Fresh one");
  });

  it("add-secret needs a name, and a folder that exists", async () => {
    expect((await control(base, { kind: "add-secret" })).status).toBe(400);
    const missing = await control(base, { folderId: "nope", kind: "add-secret", name: "x" });
    expect(missing.status).toBe(404);
  });

  it("add-request and decide-request move a request through", async () => {
    const { body } = await control(base, { kind: "add-request", reason: "Please" });
    const id = body.created as string;
    await control(base, { approve: true, id, kind: "decide-request" });
    const alice = await signIn(base, "alice");
    const list = await gql(base, alice, LIST);
    const made = (list.body.data?.approvalRequests as { id: string; status: string }[]).find(
      (r) => r.id === id,
    );
    expect(made?.status).toBe("approved");
    expect((await control(base, { id, kind: "decide-request" })).status).toBe(404);
  });

  it("hold-reveal makes a reveal wait for decide-use, which the app then redeems", async () => {
    await control(base, { kind: "hold-reveal", secretId: SECRET });
    const alice = await signIn(base, "alice");
    const direct = await gql(base, alice, REVEAL, { fieldKey: "password", id: SECRET });
    expect(direct.body.errors).toHaveLength(1);
    const prepared = await gql(base, alice, PREPARE, { fieldKey: "password", secretId: SECRET });
    const use = prepared.body.data?.prepareSecretReveal as { id: string; state: string };
    expect(use.state).toBe("PENDING");
    await control(base, { id: use.id, kind: "decide-use" });
    const redeemed = await gql(base, alice, REDEEM, { id: use.id });
    expect(redeemed.body.data?.redeemSecretReveal).toEqual(expect.any(String));
  });

  it("hold-reveal lets go again", async () => {
    await control(base, { kind: "hold-reveal", secretId: SECRET });
    await control(base, { kind: "hold-reveal", on: false, secretId: SECRET });
    const alice = await signIn(base, "alice");
    const direct = await gql(base, alice, REVEAL, { fieldKey: "password", id: SECRET });
    expect(direct.body.errors).toBeUndefined();
  });

  it("add-use puts a reveal in front of the person who decides", async () => {
    await control(base, { kind: "add-use", secretId: "mock-secret-alice-wifi" });
    const state = (await control(base, { kind: "reset" })).body;
    expect(state.uses).toEqual([expect.objectContaining({ id: "mock-use-1" })]);
    const { body } = await control(base, { kind: "add-use" });
    const uses = (await (await fetch(`${base}/_mock/controls`)).json()) as {
      uses: { id: string }[];
    };
    expect(uses.uses.map((u) => u.id)).toContain(body.created);
  });

  it("expire-session ends sessions, for one person or everyone", async () => {
    const alice = await signIn(base, "alice");
    const bob = await signIn(base, "bob");
    await control(base, { kind: "expire-session", personId: "mock-user-alice" });
    expect((await gql(base, alice, LIST)).status).toBe(401);
    expect((await gql(base, bob, LIST)).status).toBe(200);
    await control(base, { kind: "expire-session" });
    expect((await gql(base, bob, LIST)).status).toBe(401);
  });

  it("fail-next fails one call, then the next one works", async () => {
    const alice = await signIn(base, "alice");
    await control(base, { kind: "fail-next" });
    expect((await gql(base, alice, LIST)).body.errors).toHaveLength(1);
    expect((await gql(base, alice, LIST)).body.errors).toBeUndefined();
    await control(base, { kind: "fail-next", mode: "http", status: 503 });
    expect((await fetch(`${base}/livez`)).status).toBe(200);
    await expect(gql(base, alice, LIST)).rejects.toThrow();
    expect((await gql(base, alice, LIST)).status).toBe(200);
  });

  it("reset puts the data back and keeps people signed in", async () => {
    const alice = await signIn(base, "alice");
    await control(base, { kind: "add-secret", name: "Gone soon" });
    await control(base, { kind: "reset" });
    expect((await gql(base, alice, LIST)).status).toBe(200);
    expect(await names()).not.toContain("Gone soon");
  });

  it("fresh signs everyone out, and can start as a new install", async () => {
    const alice = await signIn(base, "alice");
    const { body } = await control(base, { firstRun: true, kind: "fresh" });
    expect(body.freshAt).toEqual(expect.any(String));
    expect((await gql(base, alice, LIST)).status).toBe(401);
    expect(await (await fetch(`${base}/setup/state`)).json()).toEqual({ needsSetup: true });
  });

  it("sign-in answers a working cookie", async () => {
    const { body } = await control(base, { kind: "sign-in", personId: "mock-user-bob" });
    const who = { cookie: body.cookie as string, csrf: body.csrfToken as string, userId: "" };
    expect((await gql(base, who, LIST)).status).toBe(200);
  });

  it("refuses a kind it doesn't know", async () => {
    expect((await control(base, { kind: "nope" })).status).toBe(400);
  });
});
