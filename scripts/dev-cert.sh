#!/usr/bin/env bash
# Makes the local CA and server certificate the https listener uses, under .certs/ (git-ignored).
# The CA stays the same between runs, so trusting it once is enough. The server certificate follows
# Apple's rules for a TLS leaf: a SAN, serverAuth, and at most 825 days. Add hosts to its SAN with
# MOCK_TLS_HOSTS="mac.example.org 192.0.2.10" for a real device on the network.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="${MOCK_CERT_DIR:-$root/.certs}"
mkdir -p "$out"
chmod 700 "$out"

if [[ ! -s "$out/ca.pem" || ! -s "$out/ca-key.pem" ]]; then
  openssl req -x509 -new -nodes -newkey rsa:2048 -sha256 -days 825 \
    -keyout "$out/ca-key.pem" -out "$out/ca.pem" \
    -subj "/O=Sneakers mock server/CN=Sneakers mock server local CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  echo "certs: made a new local CA at .certs/ca.pem; trust it once (see the README)"
fi

san="DNS:localhost,IP:127.0.0.1,IP:0:0:0:0:0:0:0:1"
for host in ${MOCK_TLS_HOSTS:-}; do
  if [[ "$host" =~ ^[0-9.]+$ ]]; then san="$san,IP:$host"; else san="$san,DNS:$host"; fi
done

config="$(mktemp)"
trap 'rm -f "$config" "$out/server.csr" "$out/ca.srl"' EXIT
cat >"$config" <<CONF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$san
CONF

openssl req -new -nodes -newkey rsa:2048 -sha256 \
  -keyout "$out/server-key.pem" -out "$out/server.csr" \
  -subj "/O=Sneakers mock server/CN=localhost" 2>/dev/null
openssl x509 -req -sha256 -days 397 -in "$out/server.csr" \
  -CA "$out/ca.pem" -CAkey "$out/ca-key.pem" -CAcreateserial \
  -extfile "$config" -out "$out/server.pem" 2>/dev/null
chmod 600 "$out"/*-key.pem
echo "certs: server certificate for $san at .certs/server.pem"
