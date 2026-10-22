import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password hash format: scrypt$<salt base64>$<hash base64>
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, 32).toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  const [scheme, salt, hash] = stored?.trim().split("$") ?? [];
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, Buffer.from(salt, "base64"), 32);
  const expected = Buffer.from(hash, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
