import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests read the same ignored .env.local as local development.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000, fileParallelism: false },
});
