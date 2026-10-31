import { type MockSession, mockState } from "#mock/state";

/** A native client's access tokens: each stands for a session, as the cookie does on the web. */
export const accessTokens = new Map<string, { expiresAt: number; session: MockSession }>();

/** The session behind a live `Authorization: Bearer` token. */
export const bearerSession = (request: Request): MockSession | null => {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = accessTokens.get(header.slice("Bearer ".length));
  if (!token || token.expiresAt <= Date.now()) return null;
  return [...mockState.sessions.values()].includes(token.session) ? token.session : null;
};
