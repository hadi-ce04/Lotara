import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";

// TLS parameters in the URL would override the `ssl` object below (pg merges
// the parsed connection string last), silently dropping CA verification.
const URL_SSL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl", "uselibpqcompat"];

function connectionString(): string {
  // Aiven Runtime's service integration exposes the URI as DATABASE_URL by default.
  const raw = process.env.AIVEN_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error("Missing required environment variable AIVEN_DATABASE_URL (or DATABASE_URL)");
  const url = new URL(raw);
  for (const param of URL_SSL_PARAMS) url.searchParams.delete(param);
  return url.toString();
}

// Production (Aiven Runtime): AIVEN_CA_CERT_BASE64.
// Local development may instead point AIVEN_CA_CERT_PATH at an ignored PEM file.
function caCertificate(): string {
  const base64 = process.env.AIVEN_CA_CERT_BASE64?.trim();
  const pem = base64
    ? Buffer.from(base64, "base64").toString("utf8")
    : process.env.AIVEN_CA_CERT_PATH
      ? readFileSync(process.env.AIVEN_CA_CERT_PATH, "utf8")
      : null;
  if (!pem) throw new Error("Set AIVEN_CA_CERT_BASE64 or AIVEN_CA_CERT_PATH");
  if (!pem.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("Aiven CA certificate is not a PEM certificate");
  }
  return pem;
}

const globalForPool = globalThis as unknown as { lotaraPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.lotaraPool) {
    const pool = new Pool({
      connectionString: connectionString(),
      ssl: { rejectUnauthorized: true, ca: caCertificate() },
      options: "-c search_path=lotara,public",
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    // Log the error class only; pg errors can echo connection details.
    pool.on("error", (err) => console.error("pg pool error:", err.name));
    globalForPool.lotaraPool = pool;
  }
  return globalForPool.lotaraPool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<{ ok: true; latencyMs: number }> {
  const started = Date.now();
  const { rows } = await getPool().query<{ ok: number }>("SELECT 1 AS ok");
  if (rows[0]?.ok !== 1) throw new Error("Unexpected SELECT 1 result");
  return { ok: true, latencyMs: Date.now() - started };
}
