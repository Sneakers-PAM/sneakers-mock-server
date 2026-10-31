#!/usr/bin/env node
// Starts the mock gateway: sneakers-mock-server [--port <n>] [--https-port <n>]. Port 0 picks a free
// one; the ready line names the port it got. --https-port needs the certificate from
// `npm run certs`. Runs from the TypeScript sources through vite-node: no build step.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flags = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = flags.indexOf(name);
  return at === -1 ? fallback : flags[at + 1];
};
const port = flag("--port", process.env.PORT ?? "5171");
const httpsPort = flag("--https-port", process.env.HTTPS_PORT);
if (!/^\d+$/.test(port) || (httpsPort !== undefined && !/^\d+$/.test(httpsPort))) {
  console.error("usage: sneakers-mock-server [--port <n>] [--https-port <n>]");
  process.exit(2);
}

const certificate = process.env.MOCK_TLS_CERT || path.join(root, ".certs", "server.pem");
const key = process.env.MOCK_TLS_KEY || path.join(root, ".certs", "server-key.pem");
if (httpsPort !== undefined && !(existsSync(certificate) && existsSync(key))) {
  console.error("no certificate yet: run `npm run certs` first");
  process.exit(2);
}

const server = path.join(root, "packages", "mock-gateway");
const require = createRequire(path.join(server, "package.json"));
const viteNode = path.dirname(require.resolve("vite-node/package.json"));
const { bin } = JSON.parse(readFileSync(path.join(viteNode, "package.json"), "utf8"));
const cli = path.join(viteNode, typeof bin === "string" ? bin : bin["vite-node"]);

const child = spawn(process.execPath, [cli, "--config", "serve.config.ts", "src/serve.ts"], {
  cwd: server,
  env: {
    ...process.env,
    ...(httpsPort === undefined
      ? {}
      : { HTTPS_PORT: httpsPort, MOCK_TLS_CERT: certificate, MOCK_TLS_KEY: key }),
    MOCK_SESSION_COOKIE: process.env.MOCK_SESSION_COOKIE || "sneakers_sid",
    PORT: port,
  },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
