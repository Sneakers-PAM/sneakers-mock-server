import type { UserConfig } from "vite";

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const source = (name: string) => path.join(root, "packages", name, "src");

/** The aliases every package resolves, spelled out so an install from git needs no workspace. */
export const sharedAliases = (): Record<string, string> => ({
  "@sneakers-pam/edge.server": path.join(source("mock-gateway"), "edge.server.ts"),
  "@sneakers-pam/gateway-client": path.join(source("gateway-client"), "index.ts"),
  "#gw": source("gateway-client"),
  "#mock": source("mock-gateway"),
});

const defines = {
  __APP_COMMIT__: JSON.stringify(process.env.APP_COMMIT || process.env.GITHUB_SHA || "unknown"),
  __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || "0.0.0"),
};

/** The Vitest config for a package: plain Node, with Vitest's globals. */
export const packageConfig = (directory: string) =>
  ({
    define: defines,
    resolve: { alias: sharedAliases() },
    test: {
      environment: "node",
      globals: true,
      include: ["src/**/*.test.ts"],
      root: directory,
    },
  }) satisfies { test: object } & UserConfig;

/** The mock package's tests use the same config; the name keeps the lifted tests' import. */
export const mockPackageConfig = packageConfig;
