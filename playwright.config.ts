import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { hashPassword } from "./lib/password";

// The smoke test signs in with a throwaway password generated per run, so it never
// needs (or reveals) the real demo password. The database URL comes from .env.local.
const password = process.env.E2E_ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");
process.env.E2E_ADMIN_PASSWORD = password;
const port = 3200;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`, trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next dev -p ${port}`,
        url: `http://localhost:${port}/login`,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
          DEMO_TENANT_ID: "e2e",
          DEMO_ADMIN_PASSWORD_HASH: hashPassword(password),
          SESSION_SECRET: randomBytes(32).toString("base64url"),
          PARTICIPANT_TOKEN_SECRET: randomBytes(32).toString("base64url"),
        },
      },
});
