import { http, HttpResponse } from "msw";

import type { MockSecretUse } from "#mock/fixtures/world";

import { noteFor, userById, USERS } from "#mock/fixtures/users";
import { type MockSecret, secret } from "#mock/fixtures/world";
import { mintSession } from "#mock/handlers/auth";
import { lastPositionIn, secretById } from "#mock/handlers/staff/access";
import { addAccessRequest, applyDecision } from "#mock/handlers/staff/requests";
import {
  MOCK_GATEWAY_URL,
  MOCK_SESSION_COOKIE,
  mockState,
  newToken,
  resetMockState,
} from "#mock/state";

const CONTROLS = `${MOCK_GATEWAY_URL}/_mock/controls`;
const DEFAULT_SECRET = "mock-secret-acme-vpn";
const DEFAULT_FOLDER = "mock-folder-platform";
const DEFAULT_TYPE = "type-password";
const REQUESTER = "mock-user-bob";
const DECIDER = "mock-user-alice";
const PENDING_USE_S = 600;
const REDEEM_AFTER_APPROVAL_S = 60;

/** When the server started and when Start fresh last ran, which the mock state doesn't keep. */
const startedAt = new Date().toISOString();
let freshAt: null | string = null;

const world = () => mockState.world;

/** GET /_mock/state's JSON: Maps become plain objects and Sets arrays, under the same names. */
const plain = (_key: string, value: unknown): unknown => {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
};

const held = (s: MockSecret) => !!s.alwaysRequireApproval;

const snapshot = () => ({
  failNext: mockState.failNext,
  freshAt,
  needsSetup: mockState.needsSetup,
  requests: world()
    .requests.filter((r) => r.status === "pending")
    .map(({ id, kind, reason, requestedByUserId, secretId }) => ({
      id,
      kind,
      reason: reason ?? null,
      requestedBy: userById(requestedByUserId)?.name ?? requestedByUserId,
      secretId,
    })),
  secrets: world()
    .secrets.filter((s) => !s.retired)
    .map((s) => ({ held: held(s), id: s.id, name: s.name })),
  sessionCookie: MOCK_SESSION_COOKIE,
  sessions: [...mockState.sessions.values()].map(({ userId }) => userId),
  startedAt,
  uses: world()
    .secretUses.filter((u) => u.state === "pending")
    .map(({ fieldKey, id, ownerUserId, secretName }) => ({
      fieldKey,
      id,
      requestedBy: userById(ownerUserId)?.name ?? ownerUserId,
      secretName,
    })),
});

interface Body {
  approve?: boolean;
  fieldKey?: string;
  firstRun?: boolean;
  folderId?: string;
  id?: string;
  kind?: string;
  mode?: string;
  name?: string;
  on?: boolean;
  password?: string;
  personId?: string;
  reason?: string;
  secretId?: string;
  stage?: string;
  status?: number;
  typeId?: string;
  username?: string;
}

const answer = (extra: object = {}) => HttpResponse.json({ ...snapshot(), ...extra });
const bad = (error: string, status = 400) => HttpResponse.json({ error }, { status });

const addSecret = (body: Body) => {
  if (!body.name?.trim()) return bad("name_required");
  const folderId = body.folderId ?? DEFAULT_FOLDER;
  if (!world().folders.some((f) => f.id === folderId)) return bad("unknown_folder", 404);
  const typeId = body.typeId ?? DEFAULT_TYPE;
  if (!world().secretTypes.some((t) => t.id === typeId)) return bad("unknown_type", 404);
  const made = secret(Date.now(), {
    fields: {
      password: body.password ?? `mock-${newToken("pw")}`,
      username: body.username ?? "mock-user",
    },
    folderId,
    id: newToken("mock-secret"),
    name: body.name.trim(),
    position: lastPositionIn(folderId),
    typeId,
  });
  world().secrets.push(made);
  return answer({ created: made.id });
};

const addRequest = (body: Body) => {
  const s = secretById(body.secretId ?? DEFAULT_SECRET);
  const person = body.personId ?? REQUESTER;
  if (!s) return bad("unknown_secret", 404);
  if (!userById(person)) return bad("unknown_person", 404);
  return answer({ created: addAccessRequest(s, person, body.reason).id });
};

const decideRequest = (body: Body) => {
  const r = world().requests.find((x) => x.id === body.id && x.status === "pending");
  if (!r) return bad("unknown_request", 404);
  applyDecision(r, body.approve !== false, body.personId ?? DECIDER);
  return answer();
};

const holdReveal = (body: Body) => {
  const s = secretById(body.secretId ?? DEFAULT_SECRET);
  if (!s) return bad("unknown_secret", 404);
  s.alwaysRequireApproval = body.on !== false;
  return answer();
};

const addUse = (body: Body) => {
  const s = secretById(body.secretId ?? DEFAULT_SECRET);
  const person = body.personId ?? REQUESTER;
  if (!s) return bad("unknown_secret", 404);
  if (!userById(person)) return bad("unknown_person", 404);
  s.alwaysRequireApproval = true;
  const u: MockSecretUse = {
    argv: [],
    clientLabel: "Sneakers web",
    expiresAtUnix: Math.floor(Date.now() / 1000) + PENDING_USE_S,
    fieldKey: body.fieldKey ?? "password",
    id: newToken("mock-use"),
    ownerUserId: person,
    purpose: body.reason,
    reveal: true,
    secretId: s.id,
    secretName: s.name,
    state: "pending",
  };
  world().secretUses.push(u);
  return answer({ created: u.id });
};

const decideUse = (body: Body) => {
  const pending = world().secretUses.filter((x) => x.state === "pending");
  const u = body.id ? pending.find((x) => x.id === body.id) : pending.at(-1);
  if (!u) return bad("unknown_use", 404);
  if (body.approve === false) {
    u.state = "denied";
  } else {
    u.state = "approved";
    u.expiresAtUnix = Math.floor(Date.now() / 1000) + REDEEM_AFTER_APPROVAL_S;
  }
  return answer();
};

const expireSession = (body: Body) => {
  for (const [sid, session] of mockState.sessions) {
    if (!body.personId || session.userId === body.personId) mockState.sessions.delete(sid);
  }
  return answer();
};

const failNext = (body: Body) => {
  const mode = body.mode === "http" ? "http" : "graphql";
  mockState.failNext = { mode, status: mode === "http" ? (body.status ?? 503) : 200 };
  return answer();
};

/** Puts the data back; whoever is signed in stays signed in. */
const reset = () => {
  const enrollments = new Map(mockState.enrollments);
  const sessions = new Map(mockState.sessions);
  resetMockState();
  Object.assign(mockState, { enrollments, sessions });
  return answer();
};

/** Back to first boot: everyone is signed out, and `firstRun` walks first-run setup too. */
const fresh = (body: Body) => {
  resetMockState();
  mockState.needsSetup = body.firstRun === true;
  freshAt = new Date().toISOString();
  return answer();
};

const signIn = (body: Body) => {
  const user = userById(body.personId ?? "");
  if (!user || user.disabled) return bad("unknown_person", 404);
  const enroll = !!user.mustEnroll && user.factors.length === 0;
  const half = body.stage === "half" || (body.stage === undefined && enroll);
  const { session, sid } = mintSession(user.id, !half);
  if (!half) session.mfaVerifiedAt = Date.now();
  return HttpResponse.json({
    cookie: `${MOCK_SESSION_COOKIE}=${sid}`,
    csrfToken: session.csrf,
    enroll: half,
  });
};

const KINDS: Record<string, (body: Body) => Response> = {
  "add-request": addRequest,
  "add-secret": addSecret,
  "add-use": addUse,
  "decide-request": decideRequest,
  "decide-use": decideUse,
  "expire-session": expireSession,
  "fail-next": failNext,
  fresh,
  "hold-reveal": holdReveal,
  reset,
  "sign-in": signIn,
};

/** The mock's own tools: the /_mock page and tests drive the mock through these. */
export const controlHandlers = [
  http.get(CONTROLS, () => answer()),
  http.get(
    `${MOCK_GATEWAY_URL}/_mock/state`,
    () =>
      new HttpResponse(JSON.stringify(mockState, plain), {
        headers: { "content-type": "application/json" },
      }),
  ),
  http.get(`${MOCK_GATEWAY_URL}/_mock/people`, () =>
    HttpResponse.json(
      USERS.map((u) => ({
        disabled: u.disabled,
        email: u.email,
        factors: u.factors,
        id: u.id,
        name: u.name,
        note: noteFor(u),
        username: u.username,
      })),
    ),
  ),
  http.post(CONTROLS, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Body;
    const run = KINDS[body.kind ?? ""];
    return run ? run(body) : bad("unknown_kind");
  }),
];
