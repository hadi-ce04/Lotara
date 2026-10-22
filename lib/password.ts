import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password hash format: scrypt:<salt base64url>:<hash base64url>
// It deliberately contains no "$": Next.js expands $NAME references in .env files,
// which silently corrupted the earlier scrypt$<salt>$<hash> format. That legacy
// format is still accepted when delivered raw (e.g. as an Aiven Runtime secret).

const SALT_BYTES = 16;
const KEY_BYTES = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  return `scrypt:${salt.toString("base64url")}:${scryptSync(password, salt, KEY_BYTES).toString("base64url")}`;
}

type Parsed = { salt: Buffer; hash: Buffer; legacy: boolean };

function parse(stored: string | undefined): Parsed | null {
  let value = stored?.trim();
  if (!value) return null;
  // Tolerate one pair of copied surrounding quotes.
  if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
  const modern = /^scrypt:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/.exec(value);
  const legacy = /^scrypt\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(value);
  const m = modern ?? legacy;
  if (!m) return null;
  const salt = Buffer.from(m[1], modern ? "base64url" : "base64");
  const hash = Buffer.from(m[2], modern ? "base64url" : "base64");
  if (salt.length !== SALT_BYTES || hash.length !== KEY_BYTES) return null;
  return { salt, hash, legacy: !modern };
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  const parsed = parse(stored);
  if (!parsed || !password) return false;
  const actual = scryptSync(password, parsed.salt, KEY_BYTES);
  return timingSafeEqual(actual, parsed.hash);
}

/** Converts a legacy scrypt$ hash to the current format (same password). */
export function upgradeLegacyHash(stored: string): string | null {
  const parsed = parse(stored);
  if (!parsed) return null;
  return `scrypt:${parsed.salt.toString("base64url")}:${parsed.hash.toString("base64url")}`;
}

/** Non-secret description of the configured hash, safe for diagnostics. */
export function describePasswordHash(stored: string | undefined): "missing" | "malformed" | "ok" | "ok-legacy-format" {
  if (!stored?.trim()) return "missing";
  const parsed = parse(stored);
  if (!parsed) return "malformed";
  return parsed.legacy ? "ok-legacy-format" : "ok";
}
