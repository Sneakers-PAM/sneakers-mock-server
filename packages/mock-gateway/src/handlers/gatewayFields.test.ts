// @vitest-environment node
import {
  AdminConnectionsDocument,
  AdminFolderRulesetDocument,
  AdminSaveConnectionDocument,
  auth,
  BrowseFoldersDocument,
  DashboardSecretsByStatusDocument,
  GatewayClient,
  SecretDetailDocument,
} from "@sneakers-pam/gateway-client";

import { MOCK_GATEWAY_URL, MOCK_SESSION_COOKIE, mockState } from "#mock/state";
import { sessionCookie, withMockGateway } from "#mock/testing";

withMockGateway();

const SECRET = "mock-secret-db-admin";

const as = async (userId: string) => {
  const gw = new GatewayClient({
    baseUrl: MOCK_GATEWAY_URL,
    cookieHeader: sessionCookie(userId),
    sessionCookie: MOCK_SESSION_COOKIE,
  });
  await auth.getSession(gw);
  return gw;
};
const secret = () => mockState.world.secrets.find((s) => s.id === SECRET)!;

describe("the gateway fields the mock answers", () => {
  it("says why a certificate isn't trusted, and counts it as drift", async () => {
    Object.assign(secret(), {
      lastHeartbeatDetail: "issuer not trusted",
      lastHeartbeatResult: "untrustedCertificate",
    });
    const gw = await as("mock-user-alice");
    const { secret: detail } = await gw.gql(SecretDetailDocument, { id: SECRET });
    expect(detail?.lastHeartbeatResult).toBe("untrustedCertificate");
    expect(detail?.lastHeartbeatDetail).toBe("issuer not trusted");
    const { secretsByStatus } = await gw.gql(DashboardSecretsByStatusDocument, { status: "drift" });
    expect(secretsByStatus.map((s) => s.id)).toContain(SECRET);
  });

  it("keeps a connection's KDC port", async () => {
    const gw = await as("mock-user-alice");
    const { saveConnection } = await gw.gql(AdminSaveConnectionDocument, {
      input: { kdcPort: 1088, name: "Directory", protocol: "ldaps" },
    });
    expect(saveConnection.kdcPort).toBe(1088);
    const { connections } = await gw.gql(AdminConnectionsDocument);
    expect(connections.find((c) => c.id === saveConnection.id)?.kdcPort).toBe(1088);
  });

  it("gives the Owner search each person's username and email", async () => {
    const gw = await as("mock-user-alice");
    const { users } = await gw.gql(AdminFolderRulesetDocument, {
      folderId: secret().folderId,
    });
    expect(users[0]).toEqual({
      email: expect.any(String),
      id: expect.any(String),
      name: expect.any(String),
      username: expect.any(String),
    });
  });

  it("leaves a retired secret out of a folder's subtree count", async () => {
    const gw = await as("mock-user-alice");
    const count = async () => {
      const { folders } = await gw.gql(BrowseFoldersDocument);
      return folders.find((f) => f.id === secret().folderId)?.subtreeSecretCount;
    };
    const before = await count();
    secret().retired = true;
    expect(await count()).toBe((before ?? 0) - 1);
  });
});
