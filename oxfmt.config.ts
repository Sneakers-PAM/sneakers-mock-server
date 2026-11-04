import shared from "@bugs5382/node-oxlint-config/oxfmt";

export default {
  ...shared,
  ignorePatterns: [
    ...shared.ignorePatterns,
    "dist/**",
    "coverage/**",
    "package-lock.json",
    ".github/**",
    ".claude/**",
    ".certs/**",
    "CLAUDE.md",
    "packages/contract-tests/ios-operations/**",
    "packages/gateway-client/schema/**",
  ],
  printWidth: 100,
};
