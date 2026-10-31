# sneakers-mock-server 🧩

> 🧭 Standalone in-memory mock of the whole Sneakers gateway API, shared by web, iOS and Android

One server answers the gateway's real wire protocol from invented, resettable data: GraphQL, the
sign-in routes, the health probes and native sign-in. It runs on its own, so a local build needs no
real server, and restarting an app never takes the mock or its controls down.

## 🚀 Run it

### Before you start

- Node.js 24 or later.

### Steps

1. Clone the repo and install:

   ```bash
   git clone https://github.com/Sneakers-PAM/sneakers-mock-server.git
   cd sneakers-mock-server
   npm install --ignore-scripts
   ```

2. Start the server on its usual port, 5171:

   ```bash
   npm start
   ```

   The first line it prints is `sneakers-mock-server ready http://localhost:5171`.

3. Open the controls at <http://localhost:5171/_mock>. No sign-in is needed.

Sign in as `alice`, `bob`, `carol`, `dave`, `grace` or anyone else at `GET /_mock/people`, with any
password, then any six-digit code except `000000`. `erin` is disabled, and `dave` must enrol a second
factor.

The server listens on loopback only, because its controls have no sign-in. Set `HOST=0.0.0.0` to
open it to your network.

### With Docker

```bash
docker build -t sneakers-mock-server .
docker run --rm -p 5171:5171 sneakers-mock-server
```

Each release publishes the image for linux/amd64 and linux/arm64.

## 📱 Use it from the iOS simulator

The iOS app refuses plain http, so the mock also serves https, from a local certificate authority
you trust once.

### Before you start

- Xcode, with a booted simulator.

### Steps

1. Make the certificates and start the server with https on 5443:

   ```bash
   npm run start:https
   ```

   The certificates land in `.certs/`, which git ignores. The CA stays the same between runs.

2. In another terminal, trust the CA on the booted simulator:

   ```bash
   xcrun simctl keychain booted add-root-cert .certs/ca.pem
   ```

3. In the app, add the server `localhost:5443`.

Run step 2 again for each new simulator, or after erasing one. `.certs/ca-key.pem` can sign for any
host a device trusts it for, so never commit it, and only install this CA on simulators and test
devices.

For a real device, add your Mac's name to the certificate with
`MOCK_TLS_HOSTS="mac.example.org" npm run certs`, start the server with `HOST=0.0.0.0`, then install
`.certs/ca.pem` on the device as a profile and turn it on under Settings, General, About,
Certificate Trust Settings.

## 🎛️ Controls

The `/_mock` page has the controls people use by hand. All of them are available over HTTP for tests
and scripts: `POST /_mock/controls` with a JSON body of `{ "kind": ..., ... }`. Each answers with the
controls' current state, the same as `GET /_mock/controls`, plus `created` where it makes something.

| Kind             | Body                                                          | What it does                                                                                |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `add-secret`     | `name`, optional `folderId`, `typeId`, `username`, `password` | Adds a secret                                                                               |
| `add-request`    | optional `secretId`, `personId`, `reason`                     | Adds a pending access request, from Bob by default                                          |
| `decide-request` | `id`, optional `approve`, `personId`                          | Approves a pending request, or denies it with `approve: false`, without the approver checks |
| `hold-reveal`    | optional `secretId`, `on`                                     | Holds every reveal of a secret for approval; `on: false` stops                              |
| `add-use`        | optional `secretId`, `personId`, `fieldKey`, `reason`         | Adds a held reveal from someone else, for the signed-in owner to decide                     |
| `decide-use`     | optional `id`, `approve`                                      | Approves a held reveal (the newest by default), or denies it with `approve: false`          |
| `expire-session` | optional `personId`                                           | Ends that person's sessions, or everyone's; the next call answers 401                       |
| `fail-next`      | optional `mode`, `status`                                     | Fails the next API call: a GraphQL error, or `mode: "http"` with `status` (503 by default)  |
| `reset`          |                                                               | Puts the sample data back; everyone stays signed in                                         |
| `fresh`          | optional `firstRun`                                           | Back to first boot: everyone is signed out, and `firstRun` walks first-run setup            |
| `sign-in`        | `personId`, optional `stage` (`full` or `half`)               | Answers `{ "cookie": ..., "csrfToken": ... }` for that person                               |

`GET /_mock/state` returns the whole mock state as JSON, so tests can check what a call changed.
`GET /_mock/people` lists the cast. The health probes never fail, whatever `fail-next` armed.

## 🔑 Native sign-in

The app-facing routes are the ones the gateway has today: `/auth/login`, `/auth/verify-otp` and the
step-up routes. The mock also runs the OAuth flow for native clients at `/oauth2/authorize` and
`/oauth2/token`, with PKCE `S256` required, private-use and claimed https redirects, and rotating
refresh tokens. The client id is `sneakers-ios`, with the redirect
`com.therabbithole.app.apple.sneakers-pam:/oauth2redirect`.

⚠️ That flow follows the proposal in Sneakers-PAM/sneakers-gateway#143, which the gateway hasn't
shipped. Expect it to change when the gateway's does. Its sign-in page is the mock's own list of
people, and the access token works as `Authorization: Bearer` on every route.

## 🛠 Develop

```bash
npm install --ignore-scripts
npm test             # vitest: the mock, its controls and the contract tests
npm run lint         # eslint
npm run format:check # prettier
npm run typecheck
```

The gateway schema is copied from sneakers-gateway at the commit in `schema-refs.env`. To move it,
bump the ref, run `npm run schema:copy && npm run schema:generate`, and commit the copy and the
generated files together. The iOS app's operations work the same way: bump `SNEAKERS_IOS_REF`, run
`npm run ios:operations`, and the contract tests show what changed.

## ⚖️ License

Apache-2.0. See `LICENSE`.
