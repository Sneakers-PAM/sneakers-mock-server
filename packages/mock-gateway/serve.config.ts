import path from "node:path";
import { defineConfig } from "vite";

const source = (name: string) => path.resolve(import.meta.dirname, "..", name, "src");

/**
 * The standalone server needs only the package aliases. They're spelled out because an install
 * from git has no workspace links.
 */
export default defineConfig({
  define: {
    __APP_COMMIT__: JSON.stringify(process.env.APP_COMMIT || "unknown"),
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || "0.0.0"),
  },
  resolve: {
    alias: [
      {
        find: /^@sneakers-pam\/gateway-client$/,
        replacement: path.join(source("gateway-client"), "index.ts"),
      },
      { find: /^#gw\//, replacement: `${source("gateway-client")}/` },
      { find: /^#mock\//, replacement: `${source("mock-gateway")}/` },
    ],
  },
});
