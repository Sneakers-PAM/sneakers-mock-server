import { buildSchema, parse, validate } from "graphql";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { SCHEMA_SDL } from "#gw/generated/schemaSdl";

import { control, gql, postJson, serve, type Signed, signIn } from "./harness";
import { shapeProblems } from "./shape";

const schema = buildSchema(SCHEMA_SDL);
const directory = path.join(import.meta.dirname, "..", "ios-operations");
const text = (name: string) => readFileSync(path.join(directory, `${name}.graphql`), "utf8");
const names = readdirSync(directory)
  .filter((f) => f.endsWith(".graphql"))
  .map((f) => f.replace(".graphql", ""));

const SECRET = "mock-secret-acme-vpn";
const CHECKOUT_SECRET = "mock-secret-claude-ssh-key";
const ROTATING_SECRET = "mock-secret-db-reporting";
const VERSIONED_SECRET = "mock-secret-acme-vpn";
const FOLDER = "mock-folder-platform";
const REQUEST = "mock-req-1";
const USE = "mock-use-1";
const RULE = {
  grants: [{ action: "R", value: "allow" }],
  subjectId: "mock-user-bob",
  subjectKind: "user",
  subjectName: "mock-user-bob",
};

/** Lets a recovery person read the secret, then takes the fresh step-up version recovery needs. */
const recoveryReady = (secretId: string) => async (base: string, who: Signed) => {
  const alice = await signIn(base, "alice");
  await gql(base, alice, text("SharingSetSecretRuleset"), {
    rules: [
      {
        grants: [{ action: "C", value: "allow" }],
        subjectKind: "user",
        subjectName: who.userId,
      },
    ],
    secretId,
  });
  return postJson(
    `${base}/auth/mfa/step-up`,
    { code: "123456", kind: "totp" },
    { Cookie: who.cookie, "X-CSRF-Token": who.csrf },
  );
};

interface Case {
  /** Who runs it, when not Alice. */
  as?: string;
  /** Runs first, signed in as whoever runs the operation. */
  before?: (base: string, who: Signed) => Promise<unknown>;
  variables?: Record<string, unknown>;
}

/** One happy-path call per operation, with the values the app would send. */
const CASES: Record<string, Case> = {
  ApprovalsDecideUse: { as: "carol", variables: { approve: false, id: USE } },
  ApprovalsUsesToDecide: {},
  BrowseCreateFolder: { variables: { name: "New", parentId: FOLDER } },
  BrowseCreateFolderMoveRequest: {
    variables: { destParentId: "mock-folder-alice", folderId: FOLDER },
  },
  BrowseCreateSecretMoveRequest: {
    variables: { destFolderId: "mock-folder-alice", secretId: SECRET },
  },
  BrowseFolderAccess: { variables: { folderId: FOLDER } },
  BrowseFolders: {},
  BrowseMoveFolder: {
    variables: { id: "mock-folder-alice-lab", newParentId: "mock-folder-alice" },
  },
  BrowseMoveSecret: { variables: { id: SECRET, input: { folderId: "mock-folder-network" } } },
  BrowseRenameFolder: { variables: { id: "mock-folder-alice-lab", name: "Renamed" } },
  BrowseSecrets: { variables: { folderId: FOLDER, includeRetired: false } },
  CheckoutsCheckin: {
    before: (base, alice) =>
      gql(base, alice, text("CheckoutsCheckout"), { secretId: CHECKOUT_SECRET }),
    variables: { secretId: CHECKOUT_SECRET },
  },
  CheckoutsCheckout: { variables: { secretId: CHECKOUT_SECRET } },
  CreateSecretTypes: {},
  DashboardHome: { variables: { limit: 5, userId: "mock-user-alice" } },
  DashboardLeaseNames: { variables: { a0: SECRET } },
  EditorsCreateSecret: {
    variables: {
      input: {
        fields: [
          { key: "username", value: "u" },
          { key: "password", value: "p" },
        ],
        folderId: FOLDER,
        name: "New",
        typeId: "type-password",
      },
    },
  },
  EditorsUpdateSecret: { variables: { id: SECRET, input: { name: "Renamed" } } },
  RequestsComment: { variables: { body: "Thanks", requestId: REQUEST } },
  RequestsCreate: { variables: { reason: "Need it", secretId: SECRET } },
  RequestsList: {},
  RequestsMyUses: {},
  RequestsPeople: { variables: { ids: ["mock-user-alice"] } },
  RequestsResolve: { as: "carol", variables: { approve: false, id: REQUEST } },
  RequestsSecrets: { variables: { i0: SECRET, s0: SECRET } },
  SecretAccess: { variables: { secretId: SECRET } },
  SecretDetail: { variables: { id: SECRET, secretId: SECRET } },
  SecretExportCertificate: {
    variables: { format: "pem", secretId: "mock-secret-portal-cert" },
  },
  SecretFields: { variables: { id: SECRET } },
  SecretPrepareReveal: { variables: { fieldKey: "password", runId: "run-1", secretId: SECRET } },
  SecretRedeemReveal: {
    before: (base, alice) =>
      gql(base, alice, text("SecretPrepareReveal"), {
        fieldKey: "password",
        runId: "run-1",
        secretId: SECRET,
      }),
    variables: { id: "mock-use-web-3" },
  },
  SecretRestore: {
    before: (base, alice) => gql(base, alice, text("SecretRetire"), { id: SECRET }),
    variables: { id: SECRET },
  },
  SecretRestoreVersion: {
    as: "grace",
    before: recoveryReady("mock-secret-db-admin"),
    variables: { secretId: "mock-secret-db-admin", versionNo: 1 },
  },
  SecretRetire: { variables: { id: SECRET } },
  SecretReveal: { variables: { fieldKey: "password", id: SECRET } },
  SecretRevealVersion: {
    as: "grace",
    before: recoveryReady(VERSIONED_SECRET),
    variables: { fieldKey: "password", secretId: VERSIONED_SECRET, versionNo: 1 },
  },
  SecretRotate: { variables: { secretId: ROTATING_SECRET } },
  SecretSetAutomation: {
    variables: { disableHeartbeat: true, disableRotation: true, secretId: SECRET },
  },
  SecretVersions: { variables: { secretId: SECRET } },
  SharingFolderRuleset: { variables: { folderId: FOLDER } },
  SharingGroups: {},
  SharingSearchUsers: { variables: { query: "bo" } },
  SharingSecretRuleset: { variables: { secretId: SECRET } },
  SharingSetFolderRuleset: {
    variables: { folderId: FOLDER, owners: ["mock-user-alice"], rules: [RULE] },
  },
  SharingSetSecretRuleset: { variables: { rules: [RULE], secretId: SECRET } },
  SharingSimulateFolder: {
    variables: { draftRules: [RULE], folderId: FOLDER, userId: "mock-user-bob" },
  },
  SharingSimulateSecret: {
    variables: { draftRules: [RULE], secretId: SECRET, userId: "mock-user-bob" },
  },
  SharingUserLabels: { variables: { ids: ["mock-user-alice"] } },
};

describe("every operation the iOS app sends", () => {
  let server: Awaited<ReturnType<typeof serve>>;

  beforeAll(async () => {
    server = await serve();
  });
  afterAll(() => server.stop());
  beforeEach(() => control(server.base, { kind: "fresh" }));

  it("has a case here", () => {
    expect(Object.keys(CASES).toSorted()).toEqual(names.toSorted());
  });

  it.each(names)("%s is valid against the gateway schema", (name) => {
    expect(validate(schema, parse(text(name)))).toEqual([]);
  });

  it.each(names)("%s is answered in the shape it asked for", async (name) => {
    const { as = "alice", before, variables } = CASES[name] ?? {};
    const alice = await signIn(server.base, "alice");
    const who = as === "alice" ? alice : await signIn(server.base, as);
    await before?.(server.base, who);
    const { body, status } = await gql(server.base, who, text(name), variables);
    expect(JSON.stringify(body.errors) ?? "no errors").toBe("no errors");
    expect(status).toBe(200);
    expect(shapeProblems(schema, parse(text(name)), body.data ?? {}).join("\n")).toBe("");
  });
});
