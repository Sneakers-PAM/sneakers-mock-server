import { packageConfig } from "@sneakers-pam/vite-config";
import { defineConfig, mergeConfig } from "vitest/config";

// These tests talk to the server the way a client does, so they see the live cookie name.
export default mergeConfig(
  defineConfig(packageConfig(import.meta.dirname)),
  defineConfig({ test: { env: { MOCK_SESSION_COOKIE: "sneakers_sid" } } }),
);
