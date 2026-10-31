export * as auth from "#gw/auth";
export type {
  LoginResult,
  MfaPosture,
  ResetResult,
  SecondFactor,
  SessionInfo,
  SsoReturn,
  TotpEnrollment,
} from "#gw/auth";
export {
  type AppEnvironment,
  type LogLevel,
  type PublicConfig,
  publicConfigFrom,
} from "#gw/config";
export type { Edge, QuickLoginUser } from "#gw/edge/types";
export {
  ApiError,
  type ErrorExtensions,
  GatewayUnreachableError,
  type GraphQLErrorItem,
  GraphQLRequestError,
  isRefusal,
  legacyCode,
} from "#gw/errors";
export {
  GatewayClient,
  type GatewayOptions,
  readCookie,
  type RequestOptions,
  type TypedDocument,
} from "#gw/gateway";
export * from "#gw/generated/graphql";
export { createLogger, type LogFields, type Logger, setLogFormat, setLogLevel } from "#gw/log";
export {
  bootstrapAdmin,
  confirmEmailCode,
  fetchSetupState,
  type FirstAdmin,
  requestEmailCode,
  seedBuiltins,
  type SetupProblem,
} from "#gw/setup";
export {
  beginStepUpPasskey,
  sendStepUpEmail,
  stepUp,
  type StepUpProof,
  type StepUpResult,
} from "#gw/stepUp";
export { createCredential, getAssertion, passkeysSupported } from "#gw/webauthn";
