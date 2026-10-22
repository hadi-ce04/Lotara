import { connection } from "next/server";
import { checkDatabase } from "@/lib/db";

export async function GET() {
  await connection();
  try {
    const db = await checkDatabase();
    return Response.json({ status: "ok", database: db });
  } catch (err) {
    // Do not return driver messages: they can contain host or user details.
    console.error("health check failed:", err instanceof Error ? err.name : "unknown");
    return Response.json({ status: "error", database: { ok: false } }, { status: 503 });
  }
}
