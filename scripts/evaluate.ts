import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import snapshot from "@/fixtures/development/recall-2026-04-0331.json";
import { AI_EFFORT, AI_MODEL, aiConfigured } from "../lib/ai/client";
import { PROMPT_VERSION } from "../lib/ai/investigate";
import { getPool } from "../lib/db";
import { runAiArm, type AiCaseRecord } from "../lib/eval/ai-arm";
import { nameBaseline, noticeScope, structuredArm } from "../lib/eval/arms";
import { loadCases, loadGold } from "../lib/eval/data";
import { fmt } from "../lib/eval/metrics";
import { renderResultsMarkdown } from "../lib/eval/report";
import { scoreDeterministic, scoreInvestigation, type DeterministicOutputs } from "../lib/eval/results";
import { clearEvalTenant, EVAL_TENANT, seedEvalTenant } from "../lib/eval/seed";
import type { EvalResults } from "../lib/eval/types";

// Measured evaluation (Blueprint §12). Usage: npm run eval [-- --no-ai | --limit N | --render-only]
// Arms A and B are free and deterministic. Arm C uses the real database (tenant
// "eval", cleared afterwards) and the real Anthropic API (paid, budget-capped).

const BUDGET_USD = 4;
const SEGMENT_RESERVE_USD = 0.15;
const ACTOR = "eval-manager";

// Plain Error messages are our own; library errors (pg, SDK) print their class only.
const safe = (err: unknown) => (err instanceof Error ? (err.constructor === Error ? err.message : err.name) : "unknown");

async function main() {
  // --render-only regenerates docs/RESULTS.md from the saved latest.json (no DB, no API).
  if (process.argv.includes("--render-only")) {
    const saved = JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "evaluation", "results", "latest.json"), "utf8")) as EvalResults;
    writeFileSync(path.join(process.cwd(), "docs", "RESULTS.md"), renderResultsMarkdown(saved));
    console.log("Rendered docs/RESULTS.md from fixtures/evaluation/results/latest.json");
    return;
  }
  const noAi = process.argv.includes("--no-ai");
  // --limit N investigates only the first N unresolved rows (smoke check; not a full result).
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : null;
  const started = Date.now();
  const { sites, cases } = loadCases();
  const scope = noticeScope();

  // Arms A and B (no gold labels involved).
  const out: DeterministicOutputs = { name: new Map(), structured: new Map() };
  for (const c of cases) {
    out.name.set(c.id, nameBaseline(scope, c));
    const e = structuredArm(scope, c);
    out.structured.set(c.id, { status: e.status, reasons: e.reasons, missingFields: e.missingFields });
  }

  // Arm C.
  let ai: { records: AiCaseRecord[]; budgetStopped: boolean } | null = null;
  let dbSeedConsistency: EvalResults["dbSeedConsistency"] = null;
  if (!noAi) {
    if (!aiConfigured()) throw new Error("ANTHROPIC_API_KEY is not configured; use --no-ai");
    try {
      console.log(`Seeding tenant "${EVAL_TENANT}"...`);
      const seeded = await seedEvalTenant(EVAL_TENANT, ACTOR, sites, cases);
      const mismatches: NonNullable<EvalResults["dbSeedConsistency"]>["mismatches"] = [];
      for (const c of cases) {
        const db = seeded.get(c.id)!.status ?? "NOT_MATCHING_THIS_NOTICE (no case: not a candidate)";
        const structured = out.structured.get(c.id)!.status;
        if (!db.startsWith(structured)) mismatches.push({ id: c.id, db, structured });
      }
      dbSeedConsistency = { checked: cases.length, mismatches };
      console.log(`Seed consistency: ${mismatches.length} mismatches`);
      const targets = cases
        .filter((c) => out.structured.get(c.id)!.status === "NEEDS_EVIDENCE")
        .map((c) => {
          const caseId = seeded.get(c.id)!.caseId;
          if (!caseId) throw new Error(`No database case for ${c.id}`);
          return { c, caseId, expectedRequestFields: out.structured.get(c.id)!.missingFields };
        });
      const selected = limit === null ? targets : targets.slice(0, limit);
      console.log(`AI arm: ${selected.length} of ${targets.length} unresolved rows, budget US$${BUDGET_USD}`);
      ai = await runAiArm({ tenantId: EVAL_TENANT, actorId: ACTOR, budgetUsd: BUDGET_USD, segmentReserveUsd: SEGMENT_RESERVE_USD, log: console.log }, selected);
    } finally {
      try {
        await clearEvalTenant(EVAL_TENANT);
        console.log(`Cleared tenant "${EVAL_TENANT}".`);
      } catch (err) {
        console.error("Could not clear the eval tenant:", safe(err));
      }
      await getPool().end();
    }
  }

  // Scoring: gold labels are loaded only now.
  const gold = loadGold();
  const det = scoreDeterministic(cases, out, gold);
  const record = snapshot.records[0];
  const results: EvalResults = {
    generatedAt: new Date().toISOString(),
    notice: {
      sourceId: record.numero_fiche,
      sourceVersion: record.numero_version,
      retrievedAt: snapshot.retrieved_at,
      entries: scope.entries.map((e) => `GTIN ${e.gtinRaw} lot ${e.lot ?? "all"} (${e.date ?? "no date"})`),
    },
    model: { id: AI_MODEL, effort: AI_EFFORT, promptVersion: PROMPT_VERSION },
    fixture: {
      total: cases.length,
      dev: cases.filter((c) => c.split === "dev").length,
      holdout: cases.filter((c) => c.split === "holdout").length,
      uniqueCases: cases.filter((c) => !c.duplicateOf).length,
      devUnique: cases.filter((c) => !c.duplicateOf && c.split === "dev").length,
      holdoutUnique: cases.filter((c) => !c.duplicateOf && c.split === "holdout").length,
      duplicateCopies: cases.filter((c) => c.duplicateOf).length,
    },
    dbSeedConsistency,
    arms: {
      nameBaseline: det.nameBaseline,
      structured: det.structured,
      investigation: ai ? scoreInvestigation(cases, out, ai, gold) : null,
    },
  };

  const dir = path.join(process.cwd(), "fixtures", "evaluation", "results");
  mkdirSync(dir, { recursive: true });
  const full = !noAi && limit === null;
  const file = noAi ? "deterministic-only.json" : full ? "latest.json" : "partial.json";
  writeFileSync(path.join(dir, file), `${JSON.stringify(results, null, 2)}\n`);
  if (full) writeFileSync(path.join(process.cwd(), "docs", "RESULTS.md"), renderResultsMarkdown(results));

  const line = (name: string, m: EvalResults["arms"]["nameBaseline"]["metrics"]["overall"]) =>
    console.log(`${name.padEnd(34)} precision ${fmt(m.recordedMatchPrecision)} | triage recall ${fmt(m.triageRecall)} | confirmed recall ${fmt(m.confirmedMatchRecall)} | incorrect exclusion ${fmt(m.incorrectExclusionRate)}`);
  console.log("\nOverall (unique cases):");
  line("A. product-name only", results.arms.nameBaseline.metrics.overall);
  line("B. structured (register only)", results.arms.structured.metrics.overall);
  const inv = results.arms.investigation;
  if (inv) {
    line("C. investigation (after evidence)", inv.after.overall);
    console.log(`Evidence resolution ${fmt(inv.evidence.evidenceResolution.overall)}; cost ${inv.usage.costUsd} USD over ${inv.usage.segments} segments`);
  }
  console.log(`Wrote fixtures/evaluation/results/${file}${full ? " and docs/RESULTS.md" : ""} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error("Evaluation failed:", safe(err));
  process.exit(1);
});
