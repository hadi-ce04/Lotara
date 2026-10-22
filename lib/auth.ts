import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
export { verifyPassword } from "./password";

// Demo-grade authentication: one protected manager workspace plus signed,
// site-scoped participant links for kitchens. Not production identity.

export const DEMO_TENANT = "demo";
export const MANAGER_ACTOR = "demo-manager";
const SESSION_COOKIE = "lotara_session";
const SESSION_TTL_S = 12 * 60 * 60;
const PARTICIPANT_TTL_S = 7 * 24 * 60 * 60;

function secret(name: "SESSION_SECRET" | "PARTICIPANT_TOKEN_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < 32) throw new Error(`${name} must be set (at least 32 characters)`);
  return value;
}

function sign(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function startManagerSession(): Promise<void> {
  const payload = `${MANAGER_ACTOR}.${Math.floor(Date.now() / 1000) + SESSION_TTL_S}`;
  (await cookies()).set(SESSION_COOKIE, `${payload}.${sign(payload, secret("SESSION_SECRET"))}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

export async function endManagerSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getManager(): Promise<{ actorId: string; tenantId: string } | null> {
  await connection(); // session expiry depends on the current time
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [actor, exp, sig] = raw.split(".");
  if (!actor || !exp || !sig) return null;
  if (!safeEqual(sig, sign(`${actor}.${exp}`, secret("SESSION_SECRET")))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return { actorId: actor, tenantId: DEMO_TENANT };
}

export async function requireManager(): Promise<{ actorId: string; tenantId: string }> {
  const manager = await getManager();
  if (!manager) redirect("/login");
  return manager;
}

export function createParticipantToken(siteId: string): string {
  const body = Buffer.from(JSON.stringify({ s: siteId, t: DEMO_TENANT, e: Math.floor(Date.now() / 1000) + PARTICIPANT_TTL_S })).toString("base64url");
  return `${body}.${sign(body, secret("PARTICIPANT_TOKEN_SECRET"))}`;
}

export function verifyParticipantToken(token: string): { siteId: string; tenantId: string; actorId: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign(body, secret("PARTICIPANT_TOKEN_SECRET")))) return null;
  try {
    const { s, t, e } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof s !== "string" || typeof t !== "string" || typeof e !== "number" || e < Date.now() / 1000) return null;
    return { siteId: s, tenantId: t, actorId: `participant:${s}` };
  } catch {
    return null;
  }
}
