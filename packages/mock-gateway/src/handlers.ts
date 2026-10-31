import { http, HttpResponse } from "msw";

import { adminHandlers } from "#mock/admin/handlers";
import { authHandlers } from "#mock/handlers/auth";
import { controlHandlers } from "#mock/handlers/controls";
import { failNextHandler } from "#mock/handlers/failNext";
import { api, shellHandlers } from "#mock/handlers/graphql";
import { healthHandlers } from "#mock/handlers/health";
import { iosHandlers } from "#mock/handlers/ios";
import { nativeSignInHandlers } from "#mock/handlers/nativeSignIn";
import { pageHandlers } from "#mock/handlers/page";
import { staffHandlers } from "#mock/handlers/staff";
import { stepUpHandlers } from "#mock/handlers/stepUp";
import { MOCK_GATEWAY_URL } from "#mock/state";

/**
 * Catch-alls for every gateway route the fixtures don't answer. They fail loudly, so a
 * request in mock mode never goes past the mock to a real server.
 */
const notMocked = [
  api.operation(({ operationName }) =>
    HttpResponse.json({
      errors: [
        {
          extensions: { code: "UNIMPLEMENTED" },
          message: `rpc error: code = Unimplemented desc = mock gateway has no ${operationName}`,
        },
      ],
    }),
  ),
  http.all(`${MOCK_GATEWAY_URL}/*`, () =>
    HttpResponse.json({ error: "not_mocked" } as never, { status: 501 }),
  ),
];

/** Every request the mock gateway answers. */
export const handlers = [
  ...pageHandlers,
  ...controlHandlers,
  ...healthHandlers,
  failNextHandler,
  ...nativeSignInHandlers,
  ...iosHandlers,
  ...authHandlers,
  ...stepUpHandlers,
  ...shellHandlers,
  ...adminHandlers,
  ...staffHandlers,
  ...notMocked,
];
