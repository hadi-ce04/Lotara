import { checkDatabase, getPool } from "../lib/db";

// Verifies the real Aiven connection with TLS certificate verification.
// Prints only the outcome, never connection details.
async function main() {
  try {
    const result = await checkDatabase();
    const { rows } = await getPool().query<{ ssl: boolean; version: string }>(
      "SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()",
    );
    console.log(`SELECT 1 succeeded in ${result.latencyMs} ms`);
    console.log(`TLS: ${rows[0]?.ssl ? `yes (${rows[0].version})` : "no"}, certificate verified: yes`);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(`Database check failed: ${e.name}${e.code ? ` (${e.code})` : ""}`);
    if (e.code === "SELF_SIGNED_CERT_IN_CHAIN" || e.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
      console.error("The CA certificate does not match this service. Download the project CA from Aiven.");
    }
    process.exitCode = 1;
  } finally {
    await getPool().end().catch(() => {});
  }
}

main();
