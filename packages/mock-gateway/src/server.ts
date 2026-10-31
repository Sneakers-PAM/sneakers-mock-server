import type { Server } from "node:net";

import { createLogger } from "@sneakers-pam/gateway-client";
import { getResponse } from "msw";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type RequestListener,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";

import { handlers } from "#mock/handlers";
import { MOCK_GATEWAY_URL, MOCK_ORIGIN_HEADER } from "#mock/state";

/** The mock's usual http port. 5170 is Brigade's mock, and both often run at once. */
export const MOCK_SERVER_PORT = 5171;

/** The https port the iOS simulator uses, because the app refuses plain http. */
export const MOCK_HTTPS_PORT = 5443;

export interface MockServerOptions {
  /** Where to listen. Loopback by default: the mock has no sign-in on its controls. */
  host?: string;
  port?: number;
  tls?: { cert: Buffer | string; key: Buffer | string; port: number };
}

const log = createLogger("mock-server");

const bodyOf = async (request: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> => {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
};

const headersOf = (request: IncomingMessage) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const one of [value].flat()) headers.append(name, one);
  }
  return headers;
};

/**
 * One listener for http and https, so both share one state. Every request is answered as if it
 * had reached the mock gateway's own address, with the address it really came in on in a header
 * for the answers that name it (the OAuth metadata and redirects).
 */
const listener =
  (scheme: "http" | "https"): RequestListener =>
  (incoming, outgoing) => {
    void (async () => {
      const abort = new AbortController();
      incoming.on("close", () => abort.abort());
      const headers = headersOf(incoming);
      headers.set(MOCK_ORIGIN_HEADER, `${scheme}://${incoming.headers.host ?? "localhost"}`);
      const url = new URL(incoming.url ?? "/", MOCK_GATEWAY_URL);
      const request = new Request(url, {
        body: await bodyOf(incoming),
        headers,
        method: incoming.method,
        signal: abort.signal,
      });
      const started = Date.now();
      const answer = (await getResponse(handlers, request)) ?? new Response(null, { status: 404 });
      // Paths and statuses only: bodies carry passwords and revealed values, even fake ones.
      log.debug("request answered", {
        method: incoming.method,
        ms: Date.now() - started,
        path: url.pathname,
        scheme,
        status: answer.status,
      });
      const out: Record<string, string | string[]> = {};
      for (const [name, value] of answer.headers.entries()) {
        if (name !== "set-cookie") out[name] = value;
      }
      const cookies = answer.headers.getSetCookie();
      if (cookies.length > 0) out["set-cookie"] = cookies;
      outgoing.writeHead(answer.status, out);
      outgoing.end(Buffer.from(await answer.arrayBuffer()));
    })();
  };

const listen = (server: Server, port: number, host: string) =>
  new Promise<Server>((ready) => {
    server.listen(port, host, () => ready(server));
  });

/** The mock gateway as a network server: plain http, and https too when given a certificate. */
export const startMockServer = async ({
  host = "127.0.0.1",
  port = MOCK_SERVER_PORT,
  tls,
}: MockServerOptions = {}): Promise<{ http: Server; https?: Server }> => {
  const http = await listen(createHttpServer(listener("http")), port, host);
  if (!tls) return { http };
  const https = await listen(
    createHttpsServer({ cert: tls.cert, key: tls.key }, listener("https")),
    tls.port,
    host,
  );
  return { http, https };
};
