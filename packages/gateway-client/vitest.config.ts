import { packageConfig } from "@sneakers-pam/vite-config";
import { defineConfig } from "vitest/config";

export default defineConfig(packageConfig(import.meta.dirname));
