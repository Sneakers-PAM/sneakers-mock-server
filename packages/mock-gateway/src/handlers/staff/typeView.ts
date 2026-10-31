import type { MockSecretType } from "#mock/fixtures/world";

/** A secret type with every field the gateway sends. */
export const typeView = (t: MockSecretType) => ({
  checkout: t.checkout ?? false,
  fields: t.fields.map((f) => ({
    defaultValue: f.defaultValue ?? null,
    key: f.key,
    kind: f.kind,
    label: f.label,
    maxLength: f.maxLength ?? null,
    options: f.options ?? null,
    pattern: f.pattern ?? null,
    policyEnforcement: f.policyEnforcement ?? null,
    policyId: f.policyId ?? null,
    required: f.required ?? false,
    rotates: f.rotates ?? false,
    sensitive: f.sensitive ?? false,
    superSensitive: f.superSensitive ?? false,
  })),
  heartbeat: t.heartbeat ?? false,
  id: t.id,
  name: t.name,
  origin: t.origin,
  rotation: t.rotation ?? false,
  vendor: t.vendor ?? null,
});
