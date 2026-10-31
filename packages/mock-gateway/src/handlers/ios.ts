import type { RequestHandler } from "msw";

import { HttpResponse } from "msw";

import { api, asUser } from "#mock/handlers/graphql";
import { canSee, secretById } from "#mock/handlers/staff/access";
import { decides, decideUse, useView } from "#mock/handlers/staff/agents";
import { secretAccess } from "#mock/handlers/staff/secret";
import { typeView } from "#mock/handlers/staff/typeView";
import { mockState } from "#mock/state";

/*
 * The operations only the iOS app sends. Each asks for the same things as a web operation under its
 * own name, or looks many things up at once with aliases, so they share web's rules through the
 * same helpers. Aliases are matched by the variable that feeds them: the app numbers both.
 */

const ok = (data: unknown): never => HttpResponse.json({ data } as never) as never;
const world = () => mockState.world;

const nameLookup = (userId: string, id: string) => {
  const s = secretById(id);
  return s && canSee(userId, s) ? { id: s.id, name: s.name } : null;
};

/** The variables named `<prefix><n>`, as [n, value]. */
const numbered = (variables: Record<string, unknown>, prefix: string) =>
  Object.entries(variables).flatMap(([key, value]) =>
    new RegExp(String.raw`^${prefix}\d+$`).test(key)
      ? [[key.slice(prefix.length), String(value)]]
      : [],
  ) as [string, string][];

export const iosHandlers: RequestHandler[] = [
  api.query("DashboardLeaseNames", ({ request, variables }) =>
    asUser(request, (userId) =>
      ok(
        Object.fromEntries(
          numbered(variables, "a").map(([n, id]) => [`l${n}`, nameLookup(userId, id)]),
        ),
      ),
    ),
  ),

  api.query("RequestsSecrets", ({ request, variables }) =>
    asUser(request, (userId) =>
      ok({
        ...Object.fromEntries(
          numbered(variables, "i").map(([n, id]) => [`n${n}`, nameLookup(userId, id)]),
        ),
        ...Object.fromEntries(
          numbered(variables, "s").map(([n, id]) => {
            const s = secretById(id);
            return [`a${n}`, s && canSee(userId, s) ? secretAccess(userId, s) : null];
          }),
        ),
      }),
    ),
  ),

  // Web's SecretAccess doesn't select manageRuleset, so its handler stays as it is.
  api.query("SecretAccess", ({ query, request, variables }) => {
    if (!query.includes("manageRuleset")) return;
    return asUser(request, (userId) => {
      const s = secretById(String(variables.secretId));
      if (!s || !canSee(userId, s)) return;
      const access = secretAccess(userId, s);
      return ok({ mySecretAccess: { ...access, manageRuleset: access.manage } });
    });
  }),

  api.query("CreateSecretTypes", ({ request }) =>
    asUser(request, () => ok({ secretTypes: world().secretTypes.map((t) => typeView(t)) })),
  ),

  api.query("SharingGroups", ({ request }) =>
    asUser(request, () => ok({ groups: world().groups.map(({ id, name }) => ({ id, name })) })),
  ),

  api.query("ApprovalsUsesToDecide", ({ request }) =>
    asUser(request, (userId) =>
      ok({
        secretUsesToDecide: world()
          .secretUses.filter((u) => u.state === "pending" && decides(userId, u))
          .map((u) => useView(u)),
      }),
    ),
  ),

  api.query("RequestsMyUses", ({ request }) =>
    asUser(request, (userId) =>
      ok({
        pendingSecretUses: world()
          .secretUses.filter((u) => u.ownerUserId === userId && u.state === "pending")
          .map((u) => useView(u)),
      }),
    ),
  ),

  api.mutation("ApprovalsDecideUse", ({ request, variables }) =>
    decideUse({ request, variables: variables as { approve: boolean; id: string } }),
  ),
];
