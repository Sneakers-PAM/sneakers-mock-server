// @vitest-environment node
import {
  auth,
  GatewayClient,
  GraphQLRequestError,
  TargetsPinTlsCertificateDocument,
  TargetsSaveDocument,
  TargetsScanTlsCertificateDocument,
} from "@sneakers-pam/gateway-client";

import { MOCK_GATEWAY_URL, MOCK_SESSION_COOKIE, mockState } from "#mock/state";
import { sessionCookie, withMockGateway } from "#mock/testing";

withMockGateway();

const ALICE = "mock-user-alice";
const BOB = "mock-user-bob";
const DAVE = "mock-user-dave";
// A shared target on an LDAPS connection, one on PostgreSQL over TLS, and one that is SSH only.
const DC1 = "mock-target-dc1";
const DB1 = "mock-target-db1";
const BUILD = "mock-target-build1";
const HEX = /^[\da-f]{64}$/;

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

const world = () => mockState.world;
const target = (id: string) => world().targets.find((t) => t.id === id)!;
const scan = async (userId: string, targetId: string) =>
  (await (await as(userId)).gql(TargetsScanTlsCertificateDocument, { targetId }))
    .scanTargetTlsCertificate;
const pin = async (userId: string, targetId: string, fingerprint: string) =>
  (await (await as(userId)).gql(TargetsPinTlsCertificateDocument, { fingerprint, targetId }))
    .pinTargetTlsCertificate;

const bobsTarget = () => {
  world().targets.push({
    connectionId: "mock-conn-ldaps",
    hostname: "192.0.2.30",
    id: "mock-target-bob-ldap",
    name: "Bob's directory",
    ownerUserId: BOB,
    sshHostKeys: [],
  });
  return "mock-target-bob-ldap";
};

describe("scanning a target's TLS certificate in the mock gateway", () => {
  it("reads the chain the target sends, leaf first, and pins nothing", async () => {
    const before = [...(target(DC1).tlsCertPins ?? [])];
    const s = await scan(ALICE, DC1);
    expect(s).toMatchObject({
      address: expect.stringMatching(/:636$/),
      serverName: "dc1.corp.example.org",
      targetId: DC1,
    });
    expect(s.chain.length).toBeGreaterThanOrEqual(2);
    expect(s.chain[0]).toMatchObject({ isCa: false, pinnable: true, pinned: false });
    for (const c of s.chain) expect(c.fingerprint).toMatch(HEX);
    expect(new Set(s.chain.map((c) => c.fingerprint)).size).toBe(s.chain.length);
    expect(target(DC1).tlsCertPins ?? []).toEqual(before);
  });

  it("reports the same chain on every scan", async () => {
    expect((await scan(ALICE, DC1)).chain.map((c) => c.fingerprint)).toEqual(
      (await scan(ALICE, DC1)).chain.map((c) => c.fingerprint),
    );
  });

  it("uses the first TLS connection, and never an SSH one", async () => {
    expect((await scan(ALICE, DB1)).address).toMatch(/:5432$/);
    expect(await refused(scan(ALICE, BUILD))).toMatchObject({ reason: "TARGET_NO_TLS_CONNECTION" });
    expect(await refused(pin(ALICE, BUILD, "a".repeat(64)))).toMatchObject({
      reason: "TARGET_NO_TLS_CONNECTION",
    });
  });

  it("refuses when the connector can't be reached", async () => {
    target(DC1).connectorUnavailable = true;
    expect(await refused(scan(ALICE, DC1))).toMatchObject({ reason: "CONNECTOR_UNAVAILABLE" });
    expect(await refused(pin(ALICE, DC1, "a".repeat(64)))).toMatchObject({
      reason: "CONNECTOR_UNAVAILABLE",
    });
  });
});

describe("pinning a target's TLS certificate in the mock gateway", () => {
  it("adds exactly that fingerprint, in any accepted form, and keeps the pins it has", async () => {
    const [leaf, issuer] = (await scan(ALICE, DC1)).chain;
    const colons = leaf!.fingerprint.toUpperCase().replaceAll(/(..)(?!$)/g, "$1:");
    const pinned = await pin(ALICE, DC1, `sha256:${colons}`);
    expect(pinned.tlsCertPins).toEqual([leaf!.fingerprint]);
    // Pinning the same one again changes nothing.
    expect((await pin(ALICE, DC1, leaf!.fingerprint)).tlsCertPins).toEqual([leaf!.fingerprint]);
    target(DC1).tlsCertPins = ["f".repeat(64)];
    expect((await pin(ALICE, DC1, leaf!.fingerprint)).tlsCertPins).toEqual([
      "f".repeat(64),
      leaf!.fingerprint,
    ]);
    const after = await scan(ALICE, DC1);
    expect(after.chain.find((c) => c.fingerprint === leaf!.fingerprint)?.pinned).toBe(true);
    expect(after.chain.find((c) => c.fingerprint === issuer!.fingerprint)?.pinned).toBe(false);
  });

  it("refuses a bad fingerprint, a certificate the target no longer sends, and one that can't stand alone", async () => {
    expect(await refused(pin(ALICE, DC1, "not-a-fingerprint"))).toMatchObject({
      reason: "TLS_CERT_FINGERPRINT_INVALID",
    });
    expect(await refused(pin(ALICE, DC1, "a".repeat(63)))).toMatchObject({
      reason: "TLS_CERT_FINGERPRINT_INVALID",
    });
    expect(await refused(pin(ALICE, DC1, "a".repeat(64)))).toMatchObject({
      reason: "TLS_CERT_CHANGED",
    });
    const unpinnable = (await scan(ALICE, DC1)).chain.find((c) => !c.pinnable);
    expect(unpinnable).toBeDefined();
    expect(await refused(pin(ALICE, DC1, unpinnable!.fingerprint))).toMatchObject({
      reason: "TLS_CERT_NOT_PINNABLE",
    });
    expect(target(DC1).tlsCertPins ?? []).toEqual([]);
  });

  it("lets a site admin pin a shared target and the owner a personal one, and no one else", async () => {
    const leaf = (await scan(ALICE, DC1)).chain[0]!.fingerprint;
    expect(await refused(pin(BOB, DC1, leaf))).toMatchObject({
      code: "PERMISSION_DENIED",
      reason: "TLS_CERT_PIN_NOT_ADMIN",
    });
    expect(await refused(scan(BOB, DC1))).toMatchObject({ reason: "TLS_CERT_PIN_NOT_ADMIN" });
    const mine = bobsTarget();
    const own = (await scan(BOB, mine)).chain[0]!.fingerprint;
    expect((await pin(BOB, mine, own)).tlsCertPins).toEqual([own]);
    // A personal target is hidden from other people, so they are told it doesn't exist.
    expect(await refused(scan(DAVE, mine))).toMatchObject({ code: "NOT_FOUND" });
    expect(await pin(ALICE, mine, own)).toMatchObject({ id: mine });
  });

  it("keeps a target's pins when it is saved again", async () => {
    const leaf = (await scan(ALICE, DC1)).chain[0]!.fingerprint;
    await pin(ALICE, DC1, leaf);
    const gw = await as(ALICE);
    const t = target(DC1);
    const saved = await gw.gql(TargetsSaveDocument, {
      input: {
        connectionId: t.connectionId,
        hostname: t.hostname,
        id: t.id,
        name: "Directory (renamed)",
      },
    });
    expect(saved.saveTarget.tlsCertPins).toEqual([leaf]);
  });
});
