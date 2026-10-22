/**
 * Records the end-to-end demo video (MP4 with captions + synthetic voiceover).
 * Runs the real production build against the real Aiven database and Anthropic API,
 * in an isolated "video" tenant. Usage:
 *   npm run build && npx tsx --env-file=.env.local scripts/video/record-demo.ts
 * Output: docs/submission/lotara-demo.mp4
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import { hashPassword } from "../../lib/password";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "docs", "submission");
const WORK = path.join(os.tmpdir(), `lotara-video-${Date.now()}`);
const PORT = 3500;
const BASE = `http://localhost:${PORT}`;
const W = 1600;
const H = 900;

// Narration: each segment is spoken and shown as a caption.
const SEGMENTS = {
  intro: "A food product has been recalled. A caterer running several nursery kitchens has to answer: which kitchens received the affected batch, and has anyone acted?",
  notice: "This is a real French government recall, replayed from a saved copy. It names exact batches: a barcode plus a lot number. The kitchens here are synthetic.",
  kitchens: "Les Lilas received a listed barcode and lot, so it is a recorded match. Belleville has the same lot, K101, but under the other barcode, so it is not matching this notice. A name-only search would wrongly flag it.",
  montreuil: "Montreuil needs evidence, because nobody recorded the lot at delivery. Let's open the case and run the AI investigator.",
  aiRun: "The agent can only use a few tools, limited to this one case. It reads the recall, checks the delivery record, and runs the exact batch rules. The rules, not the AI, decide the status.",
  aiDone: "It found that the lot is missing and asked this kitchen for a label photo. Every step and its cost is saved in Aiven Postgres.",
  kitchen: "This is the kitchen's view, made for a phone. They upload a photo of the label.",
  extraction: "The AI read lot K100, best before the tenth of December, but marks it unconfirmed and flags look-alike characters. Unconfirmed AI output changes nothing.",
  confirm: "A person types what the label shows and confirms. The rules re-check, and Montreuil becomes a recorded match.",
  report: "The kitchen reports that it set aside two cartons, and confirms the report.",
  review: "A staff report is not independent proof, so only the manager can close the case. Every change is in the audit trail.",
  results: "On twenty-eight test cases, name-only matching raised false alarms on eleven of twelve unaffected kitchens. Lotara was right on eleven of eleven matches, with one false alarm.",
  outro: "Lotara. Recall response for nursery kitchens, built on Aiven.",
} as const;
type SegKey = keyof typeof SEGMENTS;

function sh(cmd: string, args: string[]) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function synthesize(): Record<SegKey, { wav: string; seconds: number }> {
  const out = {} as Record<SegKey, { wav: string; seconds: number }>;
  for (const [key, text] of Object.entries(SEGMENTS) as [SegKey, string][]) {
    const wav = path.join(WORK, `${key}.wav`);
    const txt = path.join(WORK, `${key}.txt`);
    writeFileSync(txt, text, "utf8");
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
      `$s.SelectVoice('Microsoft Zira Desktop'); $s.Rate = 0; $s.SetOutputToWaveFile('${wav}'); ` +
      `$s.Speak([IO.File]::ReadAllText('${txt}')); $s.Dispose()`;
    sh("powershell", ["-NoProfile", "-Command", ps]);
    const seconds = Number(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).trim());
    out[key] = { wav, seconds };
  }
  return out;
}

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  console.log("synthesizing narration…");
  const audio = synthesize();

  // Production standalone server with static assets.
  const standalone = path.join(ROOT, ".next", "standalone");
  if (!existsSync(path.join(standalone, "server.js"))) throw new Error("run npm run build first");
  cpSync(path.join(ROOT, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
  cpSync(path.join(ROOT, "public"), path.join(standalone, "public"), { recursive: true });
  const password = randomBytes(12).toString("base64url");
  const server = spawn(process.execPath, [path.join(standalone, "server.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "localhost",
      NODE_ENV: "production",
      DEMO_TENANT_ID: "video",
      AIVEN_CA_CERT_PATH: path.join(ROOT, "certs", "aiven-ca.pem"),
      DEMO_ADMIN_PASSWORD_HASH: hashPassword(password),
      SESSION_SECRET: randomBytes(32).toString("base64url"),
      PARTICIPANT_TOKEN_SECRET: randomBytes(32).toString("base64url"),
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }

    const browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: W, height: H },
      recordVideo: { dir: WORK, size: { width: W, height: H } },
    });
    // Caption bar that survives navigations.
    // Plain-string script: tsx would inject helpers the browser lacks.
    await context.addInitScript({ content: `
      (function () {
        function paint() {
          var text = sessionStorage.getItem("lotara-caption") || "";
          var bar = document.getElementById("lotara-caption");
          if (!bar) {
            bar = document.createElement("div");
            bar.id = "lotara-caption";
            bar.setAttribute("style", "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1180px;background:rgba(29,42,35,.94);color:#fffcf5;font:500 22px/1.4 'Public Sans',system-ui,sans-serif;padding:14px 24px;border-radius:6px;z-index:2147483647;pointer-events:none;");
            (document.body || document.documentElement).appendChild(bar);
          }
          bar.textContent = text;
          bar.style.display = text ? "block" : "none";
        }
        window.__caption = function (t) { sessionStorage.setItem("lotara-caption", t); paint(); };
        if (document.readyState !== "loading") paint(); else document.addEventListener("DOMContentLoaded", paint);
      })();
    ` });
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    const t0 = Date.now();
    const marks: { key: SegKey; at: number }[] = [];

    const caption = async (p: Page, key: SegKey) => {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${key}`);
      marks.push({ key, at: (Date.now() - t0) / 1000 });
      await p.evaluate((t) => (window as unknown as { __caption: (t: string) => void }).__caption(t), SEGMENTS[key]);
      return Date.now();
    };
    /** Holds until the segment's narration has finished playing. */
    const hold = async (started: number, key: SegKey, extra = 0.4) => {
      const remaining = audio[key].seconds * 1000 + extra * 1000 - (Date.now() - started);
      if (remaining > 0) await page.waitForTimeout(remaining);
    };
    const highlight = async (loc: Locator) => {
      await loc.scrollIntoViewIfNeeded();
      await loc.evaluate((el) => {
        const e = el as HTMLElement;
        e.style.outline = "3px solid #b23a1f";
        e.style.outlineOffset = "3px";
      });
      await page.waitForTimeout(700);
    };
    const click = async (loc: Locator) => {
      await highlight(loc);
      await loc.click();
    };
    const scrollTo = async (loc: Locator) => {
      await loc.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await page.waitForTimeout(900);
    };

    // Sign in and reset (before narration starts).
    console.log("signing in…");
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Demo password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("heading", { name: "Recall response overview" }).waitFor();
    await page.getByRole("button", { name: "Reset demo" }).click();
    await page.locator("form [role=status]").filter({ hasText: /Demo data reset/ }).waitFor({ timeout: 60_000 });
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.reload();
    await page.waitForTimeout(800);

    let s = await caption(page, "intro");
    await hold(s, "intro");

    s = await caption(page, "notice");
    await scrollTo(page.getByText(/Recalled batches|recalled batches/).first());
    await hold(s, "notice");

    s = await caption(page, "kitchens");
    const card = (site: string) => page.getByRole("article").filter({ hasText: site });
    await scrollTo(card("Les Lilas"));
    await highlight(card("Les Lilas"));
    await page.waitForTimeout(2500);
    await highlight(card("Belleville"));
    await hold(s, "kitchens");

    s = await caption(page, "montreuil");
    await highlight(card("Montreuil"));
    await hold(s, "montreuil", 0);
    await click(card("Montreuil").getByRole("link", { name: "Open case" }));
    await page.locator("main header").waitFor();
    await page.waitForTimeout(800);

    s = await caption(page, "aiRun");
    await click(page.getByRole("button", { name: "Run AI investigation" }));
    await page.getByText(/Photo requested from the kitchen/).first().waitFor({ timeout: 180_000 });
    await hold(s, "aiRun");

    s = await caption(page, "aiDone");
    await scrollTo(page.getByText(/Photo requested from the kitchen/).first());
    const aiSection = page.locator("summary").filter({ hasText: /How the AI investigated|How this case was checked/ }).first();
    if (await aiSection.count()) {
      await click(aiSection);
      await page.waitForTimeout(1500);
    }
    await hold(s, "aiDone");
    const caseUrl = page.url();

    // Ask for a stock check and open the kitchen link.
    const request = page.getByRole("button", { name: "Request kitchen stock check" });
    if (await request.count()) {
      await click(request);
      await page.getByRole("link", { name: /kitchen page/ }).first().waitFor();
    }
    const kitchenHref = await page.getByRole("link", { name: /kitchen page/ }).first().getAttribute("href");

    s = await caption(page, "kitchen");
    await page.goto(new URL(kitchenHref!, BASE).toString());
    await page.waitForTimeout(1000);
    const file = page.locator('input[name="photo"]');
    await scrollTo(file);
    await file.setInputFiles(path.join(ROOT, "public", "demo", "synthetic-label-K100.png"));
    await click(page.getByRole("button", { name: "Send photo" }));
    await page.locator("form [role=status]").filter({ hasText: /Photo sent/ }).waitFor();
    await hold(s, "kitchen");

    // Back to the manager: wait for the background AI transcription.
    await page.goto(caseUrl);
    for (let i = 0; i < 60; i++) {
      if (await page.locator("dd", { hasText: /^K100$/ }).count()) break;
      await page.waitForTimeout(3000);
      await page.reload();
    }
    s = await caption(page, "extraction");
    await scrollTo(page.getByAltText("Uploaded label photo"));
    await highlight(page.getByText("AI transcription · unconfirmed"));
    await hold(s, "extraction");

    s = await caption(page, "confirm");
    await page.getByLabel("Lot code").pressSequentially("K100", { delay: 120 });
    await page.getByLabel("Best before (DD/MM/YYYY)").pressSequentially("10/12/2026", { delay: 80 });
    await page.getByLabel(/I compared these values/).check();
    await click(page.getByRole("button", { name: "Confirm values & reassess" }));
    await page.locator("main header").filter({ hasText: "Recorded match" }).waitFor({ timeout: 30_000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await hold(s, "confirm");

    s = await caption(page, "report");
    await page.goto(new URL(kitchenHref!, BASE).toString());
    await scrollTo(page.getByLabel(/I set aside the affected stock/));
    await page.getByLabel(/I set aside the affected stock/).check();
    await page.getByLabel(/Quantity/).pressSequentially("2", { delay: 120 });
    await page.getByLabel("Unit").pressSequentially("cartons", { delay: 60 });
    await page.getByLabel(/I confirm this report/).check();
    await click(page.getByRole("button", { name: "Send report" }));
    await page.locator("form [role=status]").filter({ hasText: /Report recorded/ }).waitFor();
    await hold(s, "report");

    s = await caption(page, "review");
    await page.goto(caseUrl);
    await page.getByText(/Participant reported: Set aside/).first().waitFor();
    await click(page.getByRole("button", { name: "Mark reviewed complete" }));
    await page.locator("main header").filter({ hasText: "Reviewed complete" }).waitFor({ timeout: 30_000 });
    const audit = page.locator("summary").filter({ hasText: /Audit trail/ }).first();
    if (await audit.count()) await click(audit);
    await page.waitForTimeout(1200);
    await hold(s, "review");

    s = await caption(page, "results");
    await page.goto(`${BASE}/welcome`);
    await page.waitForTimeout(800);
    // Show the public checker with the Belleville trap case.
    const preset = page.getByRole("button", { name: /Belleville/ }).first();
    if (await preset.count()) {
      await click(preset).catch(() => {});
      await page.waitForTimeout(2500);
    }
    // Optional polish steps never abort the recording.
    await scrollTo(page.getByText(/Measured, on|Measured on/).first()).catch(() => page.mouse.wheel(0, 1400));
    await hold(s, "results");

    s = await caption(page, "outro");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await hold(s, "outro", 1.2);

    const duration = (Date.now() - t0) / 1000;
    const video = page.video()!;
    await context.close();
    await browser.close();
    const webm = await video.path();

    // Voiceover: each narration clip placed at its caption time.
    const inputs = marks.flatMap((m) => ["-i", audio[m.key].wav]);
    const delays = marks.map((m, i) => `[${i + 1}:a]adelay=${Math.round(m.at * 1000)}|${Math.round(m.at * 1000)}[a${i}]`);
    const mix = `${delays.join(";")};${marks.map((_, i) => `[a${i}]`).join("")}amix=inputs=${marks.length}:normalize=0[aout]`;
    const out = path.join(OUT_DIR, "lotara-demo.mp4");
    execFileSync("ffmpeg", [
      "-y", "-i", webm, ...inputs,
      "-filter_complex", mix,
      "-map", "0:v", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "160k",
      "-t", duration.toFixed(2), "-movflags", "+faststart", out,
    ], { stdio: "ignore" });
    console.log(`wrote ${out} (${duration.toFixed(1)} s)`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error("recording failed:", err instanceof Error ? err.message.slice(0, 300) : err);
  process.exitCode = 1;
});
