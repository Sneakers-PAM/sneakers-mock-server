#!/usr/bin/env node
// Extracts every GraphQL operation the iOS app sends from its Services/VaultOperations*.swift, at
// SNEAKERS_IOS_REF in schema-refs.env, into packages/contract-tests/ios-operations. The contract
// tests run these files, so a new or changed operation in the app shows up as a failing test once
// the ref moves. SNEAKERS_IOS_DIR points at a local checkout instead.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reference = /^SNEAKERS_IOS_REF=(\S+)$/m.exec(
  readFileSync(path.join(root, "schema-refs.env"), "utf8"),
)?.[1];

/** The two operations the app builds one aliased lookup at a time, written for one lookup. */
const BUILT_AT_RUNTIME = {
  DashboardLeaseNames: "query DashboardLeaseNames($a0: ID!) { l0: secret(id: $a0) { id name } }",
  RequestsSecrets:
    "query RequestsSecrets($i0: ID!, $s0: String!) { n0: secret(id: $i0) { id name } a0: mySecretAccess(secretId: $s0) { approve } }",
};

const services = () => {
  if (process.env.SNEAKERS_IOS_DIR) return path.join(process.env.SNEAKERS_IOS_DIR, "App/Services");
  const temporary = mkdtempSync(path.join(tmpdir(), "ios-operations-"));
  process.on("exit", () => rmSync(temporary, { force: true, recursive: true }));
  const url = `https://codeload.github.com/Sneakers-PAM/sneakers-ios/tar.gz/${reference}`;
  const archive = path.join(temporary, "ios.tar.gz");
  execFileSync("curl", ["-sSfL", "-o", archive, url]);
  execFileSync("tar", ["-xzf", archive, "-C", temporary, "--strip-components=1"]);
  return path.join(temporary, "App/Services");
};

const directory = services();
const swift = readdirSync(directory)
  .filter((f) => /^VaultOperations.*\.swift$/.test(f))
  .toSorted()
  .map((f) => readFileSync(path.join(directory, f), "utf8"))
  .join("\n");

const dedent = (text) => {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const indent = Math.min(...lines.map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(indent).trimEnd()).join("\n");
};

const constants = new Map();
for (const m of swift.matchAll(
  /static let (\w+) = (?:"""\n([\s\S]*?)\n\s*"""|"((?:[^"\\]|\\.)*)")/g,
)) {
  constants.set(m[1], dedent(m[2] ?? m[3]));
}
const fill = (text) => {
  let out = text;
  for (let pass = 0; pass < 4; pass += 1) {
    out = out.replaceAll(/\\\((\w+)\)/g, (whole, name) => constants.get(name) ?? whole);
  }
  if (out.includes(String.raw`\(`)) throw new Error(`unfilled constant in: ${out}`);
  return out;
};

const operations = new Map(Object.entries(BUILT_AT_RUNTIME));
for (const m of swift.matchAll(
  /name: "(\w+)",\s*query: (?:"""\n([\s\S]*?)\n\s*"""|"((?:[^"\\]|\\.)*)")/g,
)) {
  operations.set(m[1], fill(dedent(m[2] ?? m[3])));
}

const out = path.join(root, "packages/contract-tests/ios-operations");
mkdirSync(out, { recursive: true });
for (const [name, text] of [...operations].toSorted()) {
  writeFileSync(path.join(out, `${name}.graphql`), `${text}\n`);
}
console.log(`ios-operations: wrote ${String(operations.size)} operations`);
