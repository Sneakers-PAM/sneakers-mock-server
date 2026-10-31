import { http, HttpResponse } from "msw";

import { MOCK_GATEWAY_URL, mockState } from "#mock/state";

/** The fail-next control's failure, spent on the next call to the gateway's API. */
export const failNextHandler = http.all(`${MOCK_GATEWAY_URL}/*`, () => {
  const failure = mockState.failNext;
  if (!failure) return;
  mockState.failNext = null;
  if (failure.mode === "http") return new HttpResponse(null, { status: failure.status });
  return HttpResponse.json({
    data: null,
    errors: [
      {
        extensions: { code: "INTERNAL" },
        message: "rpc error: code = Internal desc = the mock was told to fail this call",
      },
    ],
  });
});
