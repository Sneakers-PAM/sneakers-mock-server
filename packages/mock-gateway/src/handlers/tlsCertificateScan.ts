import { createHash } from "node:crypto";

import type { MockTarget } from "#mock/fixtures/world";

/**
 * Trust-on-first-use TLS certificate pinning, mocked like the host key: the chain a target
 * "sends" is deterministic (derived from its id), so a repeat scan reports the same fingerprints.
 * Nothing here pins a certificate; only the caller's pin mutation does.
 *
 * Every chain has two certificates: the target's own, which pinning alone would let the connector
 * trust, and an intermediate CA, which it would not, so a client can show both states.
 */

export interface OfferedCertificate {
  commonName: string;
  dnsNames: string[];
  fingerprint: string;
  ipAddresses: string[];
  isCa: boolean;
  issuer: string;
  notAfter: string;
  notBefore: string;
  pinnable: boolean;
  selfSigned: boolean;
  serialNumber: string;
  subject: string;
}

const sha256Hex = (text: string) => createHash("sha256").update(text).digest("hex");

/** The certificates the target would send on a fresh scan, its own first. */
export const offeredChain = (t: MockTarget): OfferedCertificate[] => {
  const issuer = "CN=Example Org Issuing CA,O=Example Org";
  const base = { notAfter: "2027-06-30T00:00:00Z", notBefore: "2026-01-01T00:00:00Z" };
  return [
    {
      ...base,
      commonName: t.hostname,
      dnsNames: [t.hostname],
      fingerprint: sha256Hex(`${t.id}:leaf`),
      ipAddresses: [],
      isCa: false,
      issuer,
      pinnable: true,
      selfSigned: false,
      serialNumber: sha256Hex(`${t.id}:leaf:serial`).slice(0, 16),
      subject: `CN=${t.hostname},O=Example Org`,
    },
    {
      ...base,
      commonName: "Example Org Issuing CA",
      dnsNames: [],
      fingerprint: sha256Hex(`${t.id}:issuer`),
      ipAddresses: [],
      isCa: true,
      issuer: "CN=Example Org Root CA,O=Example Org",
      pinnable: false,
      selfSigned: false,
      serialNumber: sha256Hex(`${t.id}:issuer:serial`).slice(0, 16),
      subject: issuer,
    },
  ];
};

/**
 * A fingerprint as the gateway accepts it, with or without a `sha256:` prefix and colons, in any
 * case, as 64 lowercase hex digits; null when it isn't one.
 */
export const normalizeFingerprint = (raw: string): null | string => {
  const hex = raw
    .trim()
    .replace(/^sha256:/i, "")
    .replaceAll(":", "")
    .toLowerCase();
  return /^[\da-f]{64}$/.test(hex) ? hex : null;
};
