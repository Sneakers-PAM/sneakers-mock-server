#!/usr/bin/env bash
# Copies sneakers-gateway's graphql/*.graphqls at the commit pinned in schema-refs.env into
# packages/gateway-client/schema. The copy is committed: it's the source the typed client and
# the mock's schema are generated from.
#
# SNEAKERS_GATEWAY_SCHEMA_DIR points at a local graphql/ directory instead, for trying an
# unmerged schema change.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$root/schema-refs.env"

dest="$root/packages/gateway-client/schema"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if [[ -n "${SNEAKERS_GATEWAY_SCHEMA_DIR:-}" ]]; then
  echo "schema: sneakers-gateway from $SNEAKERS_GATEWAY_SCHEMA_DIR"
  cp "$SNEAKERS_GATEWAY_SCHEMA_DIR"/*.graphqls "$tmp/"
else
  echo "schema: sneakers-gateway at $SNEAKERS_GATEWAY_REF"
  mkdir -p "$tmp/repo"
  curl -sSfL "https://codeload.github.com/Sneakers-PAM/sneakers-gateway/tar.gz/$SNEAKERS_GATEWAY_REF" |
    tar -xz -C "$tmp/repo" --strip-components=1
  cp "$tmp"/repo/graphql/*.graphqls "$tmp/"
fi

for f in schema.graphqls machine.graphqls; do
  [[ -s "$tmp/$f" ]] || { echo "schema: $f is missing from the gateway at that ref" >&2; exit 1; }
done

cp "$tmp"/*.graphqls "$dest/"
echo "schema: copied $(find "$dest" -maxdepth 1 -name '*.graphqls' | wc -l | tr -d ' ') files"
