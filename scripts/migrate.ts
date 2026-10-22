import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "../lib/db";

// Applies db/migrations/*.sql in order, each in its own transaction.
async function main() {
  const pool = getPool();
  const dir = path.join(process.cwd(), "db", "migrations");
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS lotara;
      CREATE TABLE IF NOT EXISTS lotara.schema_migrations (
        name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await pool.query<{ name: string }>("SELECT name FROM lotara.schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (applied.has(file)) continue;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(readFileSync(path.join(dir, file), "utf8"));
        await client.query("INSERT INTO lotara.schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
    console.log("migrations up to date");
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string };
    // Postgres SQL errors (code is a 5-char SQLSTATE) carry no credentials.
    console.error(`migration failed: ${e.name}${e.code ? ` (${e.code})` : ""}${e.code?.length === 5 ? `: ${e.message}` : ""}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
