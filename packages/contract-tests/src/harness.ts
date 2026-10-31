import type { AddressInfo, Server } from "node:net";

import { startMockServer } from "#mock/server";

export const close = (server: Server) =>
  new Promise<void>((done) => {
    server.close(() => done());
  });

/** One mock server on a free port, for the tests in one file. */
export const serve = async () => {
  const { http } = await startMockServer({ port: 0 });
  return {
    base: `http://127.0.0.1:${String((http.address() as AddressInfo).port)}`,
    stop: () => close(http),
  };
};

export interface Signed {
  cookie: string;
  csrf: string;
  userId: string;
}

export const postJson = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  });

const signedIn = async (answer: Response): Promise<Signed> => {
  const body = (await answer.json()) as { csrfToken: string; userId: string };
  const set = answer.headers.getSetCookie().find((c) => c.startsWith("sneakers_sid="));
  if (!set) throw new Error("no sneakers_sid cookie in the sign-in answer");
  return { cookie: set.split(";", 1)[0] ?? "", csrf: body.csrfToken, userId: body.userId };
};

/** Sign in the way the iOS app does: password, then a second factor when one is asked for. */
export const signIn = async (base: string, username: string): Promise<Signed> => {
  const login = await postJson(`${base}/auth/login`, { password: "anything", username });
  if (login.status !== 200) throw new Error(`login answered ${String(login.status)}`);
  const held = login.clone();
  const body = (await login.json()) as { mfaRequired?: boolean; pendingId?: string };
  if (!body.mfaRequired) return signedIn(held);
  return signedIn(
    await postJson(`${base}/auth/verify-otp`, {
      code: "123456",
      kind: "totp",
      pendingId: body.pendingId,
    }),
  );
};

/** A GraphQL call with the app's cookie and CSRF header. */
export const gql = async (
  base: string,
  who: Signed,
  query: string,
  variables: Record<string, unknown> = {},
) => {
  const operationName = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
  const answer = await postJson(
    `${base}/graphql`,
    { operationName, query, variables },
    { Cookie: who.cookie, "X-CSRF-Token": who.csrf },
  );
  return {
    body: (await answer.json()) as { data?: null | Record<string, unknown>; errors?: unknown[] },
    status: answer.status,
  };
};

export const control = async (base: string, body: object) => {
  const answer = await postJson(`${base}/_mock/controls`, body);
  return { body: (await answer.json()) as Record<string, unknown>, status: answer.status };
};
