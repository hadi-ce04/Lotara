import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { describePasswordHash, hashPassword, upgradeLegacyHash } from "../lib/password";

// Manages local demo secrets in .env.local and exports exact raw values for
// Aiven Runtime to secrets/aiven-runtime-secrets.txt (git- and docker-ignored).
// Never prints secret values.
//
//   npm run setup:secrets                   prompt for a new admin password
//   npm run setup:secrets -- --upgrade-hash  convert an existing legacy hash (same password, no prompt)
//   npm run setup:secrets -- --export        only rewrite the Runtime export file
//   add --rotate to also regenerate SESSION_SECRET and PARTICIPANT_TOKEN_SECRET

const ENV_FILE = ".env.local";
const EXPORT_FILE = "secrets/aiven-runtime-secrets.txt";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const mutable = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let prompted = false;
    mutable._writeToOutput = (s: string) => {
      if (!prompted) {
        mutable.output.write(s);
        prompted = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

/** Reads raw values (no $-expansion) from the env file. */
function readRaw(env: string, key: string): string | undefined {
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(env);
  return m?.[1].trim();
}

function upsert(env: string, key: string, value: string): string {
  if (value.includes("$")) throw new Error(`${key} must not contain "$" in a .env file`);
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(env) ? env.replace(re, () => line) : `${env.trimEnd()}\n${line}\n`;
}

function exportRuntimeSecrets(env: string) {
  const values: [string, string | undefined][] = [
    ["DEMO_ADMIN_PASSWORD_HASH", readRaw(env, "DEMO_ADMIN_PASSWORD_HASH")],
    ["SESSION_SECRET", readRaw(env, "SESSION_SECRET")],
    ["PARTICIPANT_TOKEN_SECRET", readRaw(env, "PARTICIPANT_TOKEN_SECRET")],
  ];
  const caPath = readRaw(env, "AIVEN_CA_CERT_PATH");
  if (caPath && existsSync(caPath)) values.push(["AIVEN_CA_CERT_BASE64", readFileSync(caPath).toString("base64")]);
  const body = [
    "# Exact raw values for Aiven Runtime secrets. Copy each value AFTER the first '=' on its line.",
    "# No quotes, no escaping, no trailing spaces. This file is ignored by git and Docker. Delete it when done.",
    "",
    ...values.filter(([, v]) => v).map(([k, v]) => `${k}=${v}`),
    "",
  ].join("\n");
  mkdirSync("secrets", { recursive: true });
  writeFileSync(EXPORT_FILE, body, { mode: 0o600 });
  console.log(`Wrote ${EXPORT_FILE} (${values.filter(([, v]) => v).map(([k]) => k).join(", ")})`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  let env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";

  if (args.has("--upgrade-hash")) {
    const current = readRaw(env, "DEMO_ADMIN_PASSWORD_HASH");
    const upgraded = current ? upgradeLegacyHash(current) : null;
    if (!upgraded) {
      console.error(`Cannot upgrade: existing hash is ${describePasswordHash(current)}. Run without --upgrade-hash to set a password.`);
      process.exitCode = 1;
      return;
    }
    env = upsert(env, "DEMO_ADMIN_PASSWORD_HASH", upgraded);
    console.log("Upgraded DEMO_ADMIN_PASSWORD_HASH to the $-free format (same password).");
  } else if (!args.has("--export")) {
    const password = await askHidden("New demo admin password (min 10 chars, not echoed): ");
    if (password.length < 10) {
      console.error("Password too short; nothing written.");
      process.exitCode = 1;
      return;
    }
    if ((await askHidden("Repeat password: ")) !== password) {
      console.error("Passwords do not match; nothing written.");
      process.exitCode = 1;
      return;
    }
    env = upsert(env, "DEMO_ADMIN_PASSWORD_HASH", hashPassword(password));
    console.log("Set DEMO_ADMIN_PASSWORD_HASH.");
  }

  for (const key of ["SESSION_SECRET", "PARTICIPANT_TOKEN_SECRET"]) {
    const current = readRaw(env, key);
    if (args.has("--rotate") || !current || current.length < 32) {
      env = upsert(env, key, randomBytes(32).toString("base64url"));
      console.log(`Generated new ${key}.`);
    }
  }
  writeFileSync(ENV_FILE, env, { mode: 0o600 });
  console.log(`DEMO_ADMIN_PASSWORD_HASH status: ${describePasswordHash(readRaw(env, "DEMO_ADMIN_PASSWORD_HASH"))}`);
  exportRuntimeSecrets(env);
}

main().catch((err) => {
  console.error("setup:secrets failed:", err instanceof Error ? err.message : "unknown error");
  process.exitCode = 1;
});
