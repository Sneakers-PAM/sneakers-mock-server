import type { AddressInfo } from "node:net";

import { readFileSync } from "node:fs";

import { WRONG_CODE } from "#mock/fixtures/users";
import { MOCK_SERVER_PORT, startMockServer } from "#mock/server";
import { mockState } from "#mock/state";

// Start as a new install, to walk through first-run setup.
if (process.env.MOCK_FRESH_INSTALL === "1") mockState.needsSetup = true;

const httpsPort = process.env.HTTPS_PORT;
const certificate = process.env.MOCK_TLS_CERT;
const key = process.env.MOCK_TLS_KEY;

const { http, https } = await startMockServer({
  host: process.env.HOST,
  port: Number(process.env.PORT ?? MOCK_SERVER_PORT),
  tls:
    httpsPort && certificate && key
      ? {
          cert: readFileSync(certificate),
          key: readFileSync(key),
          port: Number(httpsPort),
        }
      : undefined,
});
const { port } = http.address() as AddressInfo;
console.log(`sneakers-mock-server ready http://localhost:${String(port)}`);
if (https) {
  console.log(`  https    https://localhost:${String((https.address() as AddressInfo).port)}`);
}
console.log(`  controls http://localhost:${String(port)}/_mock`);
console.log("  sign in  alice (or anyone at /_mock/people), any password,");
console.log(`           then any six-digit code except ${WRONG_CODE}`);
