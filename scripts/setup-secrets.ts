import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { hashPassword } from "../lib/password";

// Prompts for the demo admin password without echoing it, then writes the hash
// and freshly generated session/participant secrets into .env.local.
// Prints nothing secret. Re-running replaces the existing values.

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

function upsert(env: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(env) ? env.replace(re, line) : `${env.trimEnd()}\n${line}\n`;
}

async function main() {
  const password = await askHidden("Demo admin password (min 10 chars, not echoed): ");
  if (password.length < 10) {
    console.error("Password too short; nothing written.");
    process.exitCode = 1;
    return;
  }
  const confirm = await askHidden("Repeat password: ");
  if (confirm !== password) {
    console.error("Passwords do not match; nothing written.");
    process.exitCode = 1;
    return;
  }
  let env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  env = upsert(env, "DEMO_ADMIN_PASSWORD_HASH", hashPassword(password));
  env = upsert(env, "SESSION_SECRET", randomBytes(32).toString("base64url"));
  env = upsert(env, "PARTICIPANT_TOKEN_SECRET", randomBytes(32).toString("base64url"));
  writeFileSync(".env.local", env, { mode: 0o600 });
  console.log("Wrote DEMO_ADMIN_PASSWORD_HASH, SESSION_SECRET and PARTICIPANT_TOKEN_SECRET to .env.local");
}

main();
