import type { AddressInfo } from "node:net";

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";

import { startMockServer } from "#mock/server";

import { close } from "./harness";

const root = path.resolve(import.meta.dirname, "../../..");

const text = (certificate: string) =>
  execFileSync("openssl", ["x509", "-in", certificate, "-noout", "-text"], { encoding: "utf8" });

describe("the https listener", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "mock-tls-"));
  const certs = path.join(scratch, ".certs");

  beforeAll(() => {
    execFileSync("bash", [path.join(root, "scripts/dev-cert.sh")], {
      env: { ...process.env, MOCK_CERT_DIR: certs },
    });
  });
  afterAll(() => {
    rmSync(scratch, { force: true, recursive: true });
  });

  it("makes a certificate Apple accepts for a TLS server", () => {
    const leaf = text(path.join(certs, "server.pem"));
    expect(leaf).toContain("DNS:localhost");
    expect(leaf).toContain("TLS Web Server Authentication");
    const after = /Not After : (.+)/.exec(leaf)?.[1] ?? "";
    expect(new Date(after).getTime() - Date.now()).toBeLessThan(825 * 86_400_000);
    expect(text(path.join(certs, "ca.pem"))).toContain("CA:TRUE");
  });

  it("answers over https for a client that trusts the CA", async () => {
    const { http, https } = await startMockServer({
      port: 0,
      tls: {
        cert: readFileSync(path.join(certs, "server.pem")),
        key: readFileSync(path.join(certs, "server-key.pem")),
        port: 0,
      },
    });
    const port = (https?.address() as AddressInfo).port;
    const status = await new Promise((done, fail) => {
      request(
        {
          ca: readFileSync(path.join(certs, "ca.pem")),
          hostname: "localhost",
          path: "/healthz",
          port,
        },
        (answer) => {
          answer.resume();
          done(answer.statusCode);
        },
      )
        .on("error", fail)
        .end();
    });
    await close(http);
    if (https) await close(https);
    expect(status).toBe(200);
  });
});
