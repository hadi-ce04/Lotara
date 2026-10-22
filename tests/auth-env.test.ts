import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { afterEach, describe, expect, it } from "vitest";
import { describePasswordHash, hashPassword, upgradeLegacyHash, verifyPassword } from "../lib/password";

// Loads an .env.local through the real Next.js loader (with $-expansion), as `next dev`/`next build` do.
const dirs: string[] = [];
function loadViaNext(contents: string): string | undefined {
  const dir = mkdtempSync(path.join(tmpdir(), "lotara-env-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, ".env.local"), contents);
  delete process.env.TEST_HASH;
  // Next skips .env.local when NODE_ENV=test (vitest's default); load as `next dev` would.
  const nodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "development";
  try {
    loadEnvConfig(dir, true, { info: () => {}, error: () => {} }, true);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
  }
  return process.env.TEST_HASH;
}
afterEach(() => {
  delete process.env.TEST_HASH;
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const legacyHash = (password: string) => {
  const modern = hashPassword(password).split(":");
  return `scrypt$${Buffer.from(modern[1], "base64url").toString("base64")}$${Buffer.from(modern[2], "base64url").toString("base64")}`;
};

describe("admin password hash", () => {
  it("survives the Next.js .env loader and verifies only the right password", () => {
    const hash = hashPassword("correct horse battery");
    const loaded = loadViaNext(`TEST_HASH=${hash}\n`);
    expect(loaded).toBe(hash);
    expect(verifyPassword("correct horse battery", loaded)).toBe(true);
    expect(verifyPassword("correct horse batterY", loaded)).toBe(false);
    expect(verifyPassword("", loaded)).toBe(false);
  });

  it("documents the original bug: the legacy $ format is corrupted by the Next.js loader", () => {
    const loaded = loadViaNext(`TEST_HASH=${legacyHash("pw-1234567890")}\n`);
    expect(describePasswordHash(loaded)).toBe("malformed");
    expect(verifyPassword("pw-1234567890", loaded)).toBe(false);
  });

  it("still accepts a raw legacy value, as delivered by Aiven Runtime secrets", () => {
    const legacy = legacyHash("pw-1234567890");
    expect(describePasswordHash(legacy)).toBe("ok-legacy-format");
    expect(verifyPassword("pw-1234567890", legacy)).toBe(true);
    expect(verifyPassword("pw-1234567890", `"${legacy}"`)).toBe(true);
    expect(verifyPassword("wrong-password", legacy)).toBe(false);
  });

  it("upgrades a legacy hash without changing the password", () => {
    const upgraded = upgradeLegacyHash(legacyHash("pw-1234567890"))!;
    expect(upgraded).not.toContain("$");
    expect(verifyPassword("pw-1234567890", loadViaNext(`TEST_HASH=${upgraded}\n`))).toBe(true);
  });

  it("rejects truncated or missing hashes", () => {
    const hash = hashPassword("pw-1234567890");
    expect(describePasswordHash(hash.slice(0, -4))).toBe("malformed");
    expect(describePasswordHash(undefined)).toBe("missing");
    expect(verifyPassword("pw-1234567890", hash.slice(0, -4))).toBe(false);
  });
});
