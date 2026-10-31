import { http, HttpResponse } from "msw";

import { MOCK_GATEWAY_URL } from "#mock/state";

/**
 * The mock's own controls page. It belongs to the mock server, not to any app: no sign-in, and it
 * keeps working through Start fresh. Everything goes through POST /_mock/controls, and the page
 * reads GET /_mock/controls every couple of seconds, so changes made anywhere show here.
 */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mock controls · Sneakers</title>
<style>
  :root { color-scheme: light dark; --fg: #1a1a1a; --muted: #666; --bg: #fff; --line: #ccc; --ok: #1d6b3a; --okbg: #e3f4e8; --warn: #8a1c1c; }
  @media (prefers-color-scheme: dark) { :root { --fg: #eee; --muted: #aaa; --bg: #161616; --line: #444; --ok: #8fe0a8; --okbg: #12301c; --warn: #f19a9a; } }
  body { font: 14px/1.45 system-ui, sans-serif; color: var(--fg); background: var(--bg); margin: 0; }
  main { max-width: 46rem; margin: 0 auto; padding: 2rem 1rem; display: flex; flex-direction: column; gap: 1.5rem; }
  h1 { font-size: 1.25rem; margin: 0; } h2 { font-size: 1rem; margin: 0 0 .5rem; }
  section { display: flex; flex-direction: column; gap: .5rem; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .hint { color: var(--muted); }
  button, select, input { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: .3rem .6rem; }
  button:hover { filter: brightness(.95); } input[type=text] { flex: 1; min-width: 12rem; } select { max-width: 100%; }
  #status { padding: .6rem .8rem; border-radius: 6px; background: var(--okbg); color: var(--ok); }
  #status.down { background: transparent; color: var(--warn); border: 1px solid var(--warn); }
</style>
</head>
<body>
<main>
  <div>
    <h1>Mock controls</h1>
    <p class="hint">The Sneakers mock gateway's own page. No sign-in, and Start fresh never takes it down.</p>
  </div>
  <div id="status" role="status">Loading…</div>

  <section>
    <h2>Secrets</h2>
    <div class="row"><label for="secret-name">Name</label>
      <input id="secret-name" type="text" value="New mock secret">
      <button id="add-secret">Add a secret</button></div>
  </section>

  <section>
    <h2>Requests</h2>
    <div class="row"><label for="request-secret">Secret</label><select id="request-secret"></select>
      <button id="add-request">Add a request</button></div>
    <div class="row"><label for="request">Waiting</label><select id="request"></select>
      <button id="approve-request">Approve</button><button id="deny-request">Deny</button></div>
  </section>

  <section>
    <h2>Reveals</h2>
    <div class="row"><label for="hold-secret">Secret</label><select id="hold-secret"></select>
      <button id="hold">Hold reveals for approval</button><button id="release">Stop holding</button></div>
    <div class="row"><button id="add-use">Add a reveal for me to decide</button>
      <span class="hint">A request from Bob, for the secret above.</span></div>
    <div class="row"><label for="use">Waiting</label><select id="use"></select>
      <button id="approve-use">Approve</button><button id="deny-use">Deny</button></div>
  </section>

  <section>
    <h2>Failures</h2>
    <div class="row"><button id="expire">Expire every session</button>
      <span class="hint">The next call answers 401.</span></div>
    <div class="row"><button data-send='{"kind":"fail-next"}'>Fail the next call</button>
      <button data-send='{"kind":"fail-next","mode":"http","status":503}'>Fail it with a 503</button></div>
  </section>

  <section>
    <h2>Start over</h2>
    <div class="row"><button data-send='{"kind":"reset"}'>Put the sample data back</button>
      <span class="hint">Everyone stays signed in.</span></div>
    <div class="row"><button data-send='{"kind":"fresh"}'>Start fresh</button>
      <span class="hint">Back to first boot: everyone is signed out.</span></div>
    <div class="row"><button data-send='{"kind":"fresh","firstRun":true}'>Start as a new install</button>
      <span class="hint">The same, and the apps walk first-run setup.</span></div>
  </section>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  const status = $("status");
  const send = async (body) => {
    const answer = await fetch("/_mock/controls", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
    if (!answer.ok) { status.textContent = "That didn't work: " + answer.status; status.className = "down"; return; }
    await refresh();
  };
  const fill = (select, items, label) => {
    const keep = select.value;
    select.replaceChildren(...items.map((item) => { const o = document.createElement("option"); o.value = item.id; o.textContent = label(item); return o; }));
    if (items.some((item) => item.id === keep)) select.value = keep;
  };
  const refresh = async () => {
    try {
      const state = await (await fetch("/_mock/controls")).json();
      status.className = "";
      status.textContent = state.sessions.length + " signed in, " + state.requests.length + " requests and " + state.uses.length + " reveals waiting" + (state.failNext ? ", next call fails" : "") + (state.freshAt ? ", started fresh " + new Date(state.freshAt).toLocaleTimeString() : "");
      const secretLabel = (s) => s.name + (s.held ? " (held)" : "");
      fill($("request-secret"), state.secrets, secretLabel);
      fill($("hold-secret"), state.secrets, secretLabel);
      fill($("request"), state.requests, (r) => r.requestedBy + ": " + r.kind + " " + r.secretId);
      fill($("use"), state.uses, (u) => u.requestedBy + ": " + u.secretName + " / " + u.fieldKey);
    } catch { status.textContent = "The mock server isn't answering."; status.className = "down"; }
  };
  for (const button of document.querySelectorAll("[data-send]")) button.addEventListener("click", () => send(JSON.parse(button.dataset.send)));
  $("add-secret").addEventListener("click", () => send({ kind: "add-secret", name: $("secret-name").value }));
  $("add-request").addEventListener("click", () => send({ kind: "add-request", secretId: $("request-secret").value }));
  $("approve-request").addEventListener("click", () => send({ approve: true, id: $("request").value, kind: "decide-request" }));
  $("deny-request").addEventListener("click", () => send({ approve: false, id: $("request").value, kind: "decide-request" }));
  $("hold").addEventListener("click", () => send({ kind: "hold-reveal", secretId: $("hold-secret").value }));
  $("release").addEventListener("click", () => send({ kind: "hold-reveal", on: false, secretId: $("hold-secret").value }));
  $("add-use").addEventListener("click", () => send({ kind: "add-use", secretId: $("hold-secret").value }));
  $("approve-use").addEventListener("click", () => send({ approve: true, id: $("use").value, kind: "decide-use" }));
  $("deny-use").addEventListener("click", () => send({ approve: false, id: $("use").value, kind: "decide-use" }));
  $("expire").addEventListener("click", () => send({ kind: "expire-session" }));
  void refresh();
  setInterval(refresh, 2000);
</script>
</body>
</html>
`;

export const pageHandlers = [
  http.get(
    `${MOCK_GATEWAY_URL}/_mock`,
    () => new HttpResponse(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } }),
  ),
];
