import { http, HttpResponse } from "msw";

import { MOCK_GATEWAY_URL } from "#mock/state";

/** What the mock calls itself. The version is a release shape the apps can parse. */
const version = () => process.env.MOCK_SERVER_VERSION || "v0.1.0-mock";

const healthy = () =>
  HttpResponse.json({ status: "ok" }, { headers: { "Sneakers-Version": version() } });

/** The probes the apps call before signing in. They never fail, whatever the controls armed. */
export const healthHandlers = [
  http.get(`${MOCK_GATEWAY_URL}/livez`, healthy),
  http.get(`${MOCK_GATEWAY_URL}/healthz`, healthy),
  http.get(`${MOCK_GATEWAY_URL}/readyz`, healthy),
];
