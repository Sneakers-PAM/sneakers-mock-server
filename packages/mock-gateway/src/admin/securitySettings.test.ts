// @vitest-environment node
import {
  AdminPoliciesDocument,
  AdminUpdateSecuritySettingsDocument,
  auth,
  GatewayClient,
  GraphQLRequestError,
} from "@sneakers-pam/gateway-client";

import { MOCK_GATEWAY_URL, MOCK_SESSION_COOKIE } from "#mock/state";
import { sessionCookie, withMockGateway } from "#mock/testing";

withMockGateway();

const ALICE = "mock-user-alice";
const BOB = "mock-user-bob";

const as = async (userId: string) => {
  const gw = new GatewayClient({
    baseUrl: MOCK_GATEWAY_URL,
    cookieHeader: sessionCookie(userId),
    sessionCookie: MOCK_SESSION_COOKIE,
  });
  await auth.getSession(gw);
  return gw;
};

const refused = async (p: Promise<unknown>) => {
  const error = await p.then(
    () => null,
    (error_: unknown) => error_,
  );
  expect(error).toBeInstanceOf(GraphQLRequestError);
  const r = error as GraphQLRequestError;
  return { code: r.code, reason: r.reason };
};

const read = async (gw: GatewayClient) =>
  (await gw.gql(AdminPoliciesDocument, {})).securitySettings.disabledMcpTools;
const set = async (gw: GatewayClient, input: Record<string, unknown>) =>
  (await gw.gql(AdminUpdateSecuritySettingsDocument, { input })).updateSecuritySettings;

const names = (n: number) => Array.from({ length: n }, (_, index) => `tool_${index}`);

describe("the disabled MCP tools setting in the mock gateway", () => {
  it("starts with every tool on, as an empty list", async () => {
    expect(await read(await as(ALICE))).toEqual([]);
  });

  it("replaces the list with the one sent, and an empty list turns every tool back on", async () => {
    const gw = await as(ALICE);
    expect(
      (await set(gw, { disabledMcpTools: ["rotate_secret", "delete_secret"] })).disabledMcpTools,
    ).toEqual(["rotate_secret", "delete_secret"]);
    expect((await set(gw, { disabledMcpTools: ["find_secrets"] })).disabledMcpTools).toEqual([
      "find_secrets",
    ]);
    expect((await set(gw, { disabledMcpTools: [] })).disabledMcpTools).toEqual([]);
    expect(await read(gw)).toEqual([]);
  });

  it("keeps the list when it is omitted or null, whatever else is changed", async () => {
    const gw = await as(ALICE);
    await set(gw, { disabledMcpTools: ["rotate_secret"] });
    const changed = await set(gw, { requireMfaForReveal: true });
    expect(changed).toMatchObject({
      disabledMcpTools: ["rotate_secret"],
      requireMfaForReveal: true,
    });
    expect((await set(gw, { disabledMcpTools: null })).disabledMcpTools).toEqual(["rotate_secret"]);
    expect(await read(gw)).toEqual(["rotate_secret"]);
  });

  it("trims names and drops blanks and repeats, keeping the first-seen order", async () => {
    const gw = await as(ALICE);
    const saved = await set(gw, {
      disabledMcpTools: ["  rotate_secret ", "", " ".repeat(3), "delete_secret", "rotate_secret"],
    });
    expect(saved.disabledMcpTools).toEqual(["rotate_secret", "delete_secret"]);
  });

  it("refuses more than 100 names, a name over 64 characters and a control character", async () => {
    const gw = await as(ALICE);
    await set(gw, { disabledMcpTools: ["rotate_secret"] });
    expect((await set(gw, { disabledMcpTools: names(100) })).disabledMcpTools).toHaveLength(100);
    for (const bad of [names(101), ["x".repeat(65)], ["rotate\nsecret"]]) {
      expect(await refused(set(gw, { disabledMcpTools: bad }))).toMatchObject({
        code: "INVALID_ARGUMENT",
      });
    }
    // A refused write changes nothing; repeats and blanks don't count toward the 100.
    expect(await read(gw)).toHaveLength(100);
    const padded = [...names(100), ...names(100), "", " "];
    expect((await set(gw, { disabledMcpTools: padded })).disabledMcpTools).toHaveLength(100);
    expect((await set(gw, { disabledMcpTools: ["é".repeat(64)] })).disabledMcpTools).toHaveLength(
      1,
    );
  });

  it("is changed by a site admin only", async () => {
    const bob = await as(BOB);
    expect(await refused(set(bob, { disabledMcpTools: ["rotate_secret"] }))).toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(await read(await as(ALICE))).toEqual([]);
  });
});
