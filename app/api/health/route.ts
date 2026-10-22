import { connection } from "next/server";
import { checkDatabase } from "@/lib/db";
import { describePasswordHash } from "@/lib/password";
import { RELEASE } from "@/lib/release";

// Configuration is reported as categories/booleans only, never values.
function configSummary() {
  const long = (name: string) => (process.env[name]?.trim().length ?? 0) >= 32;
  return {
    adminPasswordHash: describePasswordHash(process.env.DEMO_ADMIN_PASSWORD_HASH),
    sessionSecret: long("SESSION_SECRET"),
    participantTokenSecret: long("PARTICIPANT_TOKEN_SECRET"),
    anthropicApiKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  };
}

export async function GET() {
  await connection();
  const config = configSummary();
  try {
    const db = await checkDatabase();
    return Response.json({ status: "ok", release: RELEASE, database: db, config });
  } catch (err) {
    // Do not return driver messages: they can contain host or user details.
    console.error("health check failed:", err instanceof Error ? err.name : "unknown");
    return Response.json({ status: "error", release: RELEASE, database: { ok: false }, config }, { status: 503 });
  }
}
