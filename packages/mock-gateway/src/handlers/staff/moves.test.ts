// @vitest-environment node
import {
  auth,
  BrowseCreateSecretMoveRequestDocument,
  BrowseMoveSecretDocument,
  EditorsUpdateSecretDocument,
  GatewayClient,
  GraphQLRequestError,
  RequestsResolveDocument,
  SecretMovesDocument,
} from "@sneakers-pam/gateway-client";

import { MOCK_GATEWAY_URL, MOCK_SESSION_COOKIE, mockState } from "#mock/state";
import { sessionCookie, withMockGateway } from "#mock/testing";

withMockGateway();

const ALICE = "mock-user-alice";
const BOB = "mock-user-bob";
const DB = "mock-secret-db-admin";

const as = async (userId: string) => {
  const gw = new GatewayClient({
    baseUrl: MOCK_GATEWAY_URL,
    cookieHeader: sessionCookie(userId),
    sessionCookie: MOCK_SESSION_COOKIE,
  });
  await auth.getSession(gw);
  return gw;
};

const refusal = async (p: Promise<unknown>) => {
  const error = await p.then(
    () => null,
    (error_: unknown) => error_,
  );
  expect(error).toBeInstanceOf(GraphQLRequestError);
  const refused = error as GraphQLRequestError;
  return { code: refused.code, reason: refused.reason };
};

const moves = async (userId: string, secretId: string) =>
  (await (await as(userId)).gql(SecretMovesDocument, { secretId })).secretMoves;
const world = () => mockState.world;

describe("a secret's folder moves in the mock gateway", () => {
  it("starts with no moves", async () => {
    expect(await moves(ALICE, DB)).toEqual([]);
  });

  it("records a move made from the browse page, newest first, with who and when", async () => {
    const start = world().secrets.find((s) => s.id === DB)?.folderId;
    const gw = await as(ALICE);
    await gw.gql(BrowseMoveSecretDocument, { folderId: "mock-folder-network", id: DB });
    await gw.gql(BrowseMoveSecretDocument, { folderId: "mock-folder-certificates", id: DB });
    const list = await moves(ALICE, DB);
    expect(list.map((m) => [m.fromFolderId, m.toFolderId])).toEqual([
      ["mock-folder-network", "mock-folder-certificates"],
      [start, "mock-folder-network"],
    ]);
    expect(list[0]).toMatchObject({ movedBy: ALICE, movedByName: "Alice" });
    expect(Number.isNaN(Date.parse(list[0]?.movedAt ?? ""))).toBe(false);
  });

  it("records no move when the folder stays the same", async () => {
    const gw = await as(ALICE);
    const here = world().secrets.find((s) => s.id === DB)?.folderId ?? "";
    await gw.gql(BrowseMoveSecretDocument, { folderId: here, id: DB });
    expect(await moves(ALICE, DB)).toEqual([]);
  });

  it("records a move made by saving the editor with a new folder", async () => {
    const gw = await as(ALICE);
    await gw.gql(EditorsUpdateSecretDocument, {
      id: DB,
      input: {
        fields: [{ key: "username", value: "postgres_admin" }],
        folderId: "mock-folder-network",
        name: "DB admin",
      },
    });
    expect((await moves(ALICE, DB)).map((m) => m.toFolderId)).toEqual(["mock-folder-network"]);
  });

  it("records a move when an approver accepts a secret-move request, not when it is asked", async () => {
    const gw = await as(ALICE);
    const asked = await gw.gql(BrowseCreateSecretMoveRequestDocument, {
      destFolderId: "mock-folder-alice",
      secretId: DB,
    });
    // The asker can't decide their own request, so hand it to Bob before Alice approves it.
    const pending = world().requests.find((r) => r.id === asked.createSecretMoveRequest.id);
    if (pending) pending.requestedByUserId = BOB;
    expect(await moves(ALICE, DB)).toEqual([]);
    await gw.gql(RequestsResolveDocument, {
      approve: true,
      id: asked.createSecretMoveRequest.id,
    });
    const list = await moves(ALICE, DB);
    expect(list).toHaveLength(1);
    expect(list[0]?.toFolderId).toBe("mock-folder-alice");
  });

  it("answers as the vault does for a secret the person can't see or can't read", async () => {
    expect(await refusal(moves(BOB, "mock-secret-alice-wifi"))).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await refusal(moves(BOB, "mock-secret-helpdesk"))).toEqual({
      code: "PERMISSION_DENIED",
      reason: "NO_ACCESS",
    });
  });
});
