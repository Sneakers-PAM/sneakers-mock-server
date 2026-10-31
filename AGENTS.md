# AGENTS.md - sneakers-mock-server

Guide for AI agents working in this repository. Pair with `CLAUDE.md` (the working agreement and
hook-enforced rules). Keep this file current when the build, layout, or public API changes.

## What this is

One in-memory server that answers the whole Sneakers gateway API on its real wire protocol: GraphQL
at `/graphql`, the sign-in routes under `/auth`, the probes (`/livez`, `/healthz`) and the OAuth
routes for native sign-in. The data is seeded, invented and resettable. Web, iOS and Android point
at one server. Its own controls page is `/_mock`, and the same controls are `POST /_mock/controls`.

The mock follows the gateway, not the screens. One thing is ahead of it on purpose: native sign-in
follows the proposal in Sneakers-PAM/sneakers-gateway#143, which hasn't shipped. When it does,
`handlers/nativeSignIn.ts` moves to match.

## Using sneakers-mock-server

- Clients reach the mock over HTTP. `@sneakers-pam/mock-server/testing`
  (`packages/mock-gateway/src/pure.ts`) is the seeded people as pure code; keep it free of state.
- One exception: sneakers-web's unit tests change mock state directly, so they import
  `@sneakers-pam/mock-server/in-process` and `/in-process/testing`, pinned to a commit. These run
  TypeScript sources, so the importer aliases `#mock`, `#gw` and `@sneakers-pam/gateway-client`.
- The standalone server uses the live session cookie, `sneakers_sid`. `MOCK_SESSION_COOKIE`
  overrides it; in-process tests keep the `mock_` name.
- Every control kind is in the README's Controls table. Keep the table, the `/_mock` page and
  `handlers/controls.ts` in step.

## Layout

- `bin/sneakers-mock-server.mjs` - the entry point; starts `src/serve.ts` under vite-node.
- `packages/mock-gateway/` - the mock: handlers (`src/handlers/`, `src/admin/`), fixtures
  (`src/fixtures/`), the state (`src/state.ts`), the network server (`src/server.ts`), the controls
  (`handlers/controls.ts`, `handlers/page.ts`), the iOS-only operations (`handlers/ios.ts`).
- `packages/gateway-client/` - the typed client, the schema copied from sneakers-gateway (`schema/`)
  and what's generated from it (`src/generated/`).
- `packages/contract-tests/` - tests over HTTP. `ios-operations/` holds every operation the iOS app
  sends, extracted from its source at the ref in `schema-refs.env`.
- `packages/vite-config/` - the Vitest config the packages share.
- `scripts/` - `schema-copy.sh`, `schema-generate.sh`, `ios-operations.mjs`, `dev-cert.sh`.

## Build, test, lint

- Run: `npm start` (http on 5171), `npm run start:https` (adds https on 5443).
- Test: `npm test`. Lint: `npm run lint`, `npm run format:check`, `npm run typecheck`.
- Schema: bump `SNEAKERS_GATEWAY_REF`, then `npm run schema:copy && npm run schema:generate`.
- iOS operations: bump `SNEAKERS_IOS_REF`, then `npm run ios:operations`, and add a case to
  `ios.test.ts` for anything new.

## Logging

Follow the logging rules in `CLAUDE.md`. In short:

- Log generously: entry and exit of significant operations, decisions and branches, retries, state
  changes, external calls (target, duration, outcome), and every error with its context.
- Levels: `trace` for step-by-step detail, `debug` for flow, `info` for lifecycle, `warn` and
  `error` for problems. The environment filters the volume, so err on the side of too much.
- Environments: local dev `trace` with `LOG_FORMAT=console` (never JSON), dev cluster `debug`,
  qa/staging `info`, production `error`. Every cluster environment logs JSON. Set levels through
  `LOG_LEVEL` and `LOG_FORMAT`, never in code; local settings live in the run target or
  `.env.example`.
- Never log secrets, tokens, or personal data, not even at `trace`. Log an opaque or keyed ID.

## Conventions and gotchas

- See `CLAUDE.md` for the branch/commit/PR rules; they are enforced by the git hooks in
  `.claude/hooks` (run `bash .claude/hooks/install.sh` once per clone).
- Open every PR as a draft. CI skips drafts, so run the full checks locally, push once they pass,
  and mark the PR ready when the work is finished; see CLAUDE.md "CI and Actions minutes".
- Never test against a mock someone is reviewing with: start your own with `--port 0`. Its controls
  reset and sign people out.
- 5170 is Brigade's mock, so this one defaults to 5171.
- The server binds to loopback unless `HOST` says otherwise, because the controls have no sign-in.
- A handler's answer may carry extra fields for web and iOS at once, since each ignores what it
  didn't select, unless a web test pins the exact answer. Then branch in `handlers/ios.ts`.
- Web's and iOS's operations share names. MSW matches by name, so `handlers/ios.ts` runs first and
  returns nothing to pass a request on to web's handler.
- Prettier never touches `schema/`, `ios-operations/`, `src/generated/` or the governance files:
  the copies must stay byte-exact. See `.prettierignore`.
