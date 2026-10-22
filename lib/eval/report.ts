import { REASON_TEXT, type ReasonCode } from "../matching/evaluate";
import { fmt, type BySplit, type CaseFailure, type StatusMetrics } from "./metrics";
import type { EvalResults } from "./types";

// Renders docs/RESULTS.md from the machine-readable results. Every number comes from
// the results object; nothing here is hand-entered.

const ROWS: [keyof StatusMetrics, string][] = [
  ["recordedMatchPrecision", "Recorded-match precision"],
  ["triageRecall", "Triage recall (match or needs evidence)"],
  ["confirmedMatchRecall", "Confirmed-match recall"],
  ["incorrectExclusionRate", "Incorrect exclusion rate (lower is better)"],
  ["falseAlertRate", "Alerts/requests on non-affected cases (lower is better)"],
  ["agreementWithExpected", "Status equals gold expected status"],
];

/** Known causes for failure categories in the register-driven arms (B, C), written from the code paths involved. */
const SYSTEM_NOTES: Record<string, string> = {
  missing_gtin:
    "Product gap: the confirmation step (confirmLabelReading) records only lot and best-before. The GTIN was requested and correctly extracted from the label, but a person cannot confirm it, so the evaluator still sees GTIN_MISSING and the case cannot leave NEEDS_EVIDENCE.",
  register_transcription_error:
    "Register says a non-listed lot while the physical label carries a listed lot. Nothing in the register prompts a photo, so every register-driven arm excludes it; only a physical stock check would catch it.",
};

/** Why the name-only baseline fails each category. */
const NAME_NOTES: Record<string, string> = {
  same_brand_other_product: "Name-level matching cannot distinguish products of the same brand.",
  other_brand_similar_name: "Name-level matching flags any product whose name contains a listed reference.",
  o0_lookalike_register: "Name-level matching ignores the lot entirely.",
  lot_not_listed: "Name-level matching ignores the lot entirely.",
  lot_under_other_gtin: "Name-level matching ignores GTIN/lot pairing.",
  missing_lot: "No batch was recorded; the baseline alerts on the name alone and the label later shows a non-listed lot.",
  missing_gtin: "No GTIN or batch was recorded; the baseline alerts on the name alone and the label later shows a non-listed lot.",
  o0_lookalike_label: "No batch was recorded; the baseline alerts on the name alone, while the label's lot K1OO (letter O) is not listed.",
};

function metricsTable(cols: [string, BySplit<StatusMetrics>][], split: keyof BySplit<StatusMetrics>) {
  const head = `| Metric | ${cols.map(([n]) => n).join(" | ")} |\n|---|${cols.map(() => "---").join("|")}|`;
  const body = ROWS.map(([k, label]) => `| ${label} | ${cols.map(([, m]) => fmt(m[split][k] as never)).join(" | ")} |`).join("\n");
  const counts = `| Unique cases / affected / declared matches / needs evidence | ${cols
    .map(([, m]) => `${m[split].uniqueCases} / ${m[split].affected} / ${m[split].declaredRecordedMatch} / ${m[split].needsEvidence}`)
    .join(" | ")} |`;
  return `${head}\n${counts}\n${body}`;
}

function failureList(list: CaseFailure[], notes: Record<string, string>, reasons?: Record<string, { reasons: ReasonCode[] }>) {
  if (list.length === 0) return "_No failures in this arm._";
  return list
    .map((f) => {
      const why = reasons?.[f.id]?.reasons.map((r) => REASON_TEXT[r]).join(" ");
      const note = notes[f.category];
      return `- **${f.id}** (${f.split}, ${f.category}, affected=${f.affected}): got \`${f.got}\`, expected \`${f.expected}\`${
        f.affected && f.got === "NOT_MATCHING_THIS_NOTICE" ? " — incorrect exclusion of an affected case" : ""
      }. Gold: ${f.rationale}${why ? ` System reasons: ${why}` : ""}${note ? ` _Note:_ ${note}` : ""}`;
    })
    .join("\n");
}

const usd = (x: number | null) => (x === null ? "n/a" : `US$${x.toFixed(4)}`);
const sec = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);

export function renderResultsMarkdown(r: EvalResults): string {
  const inv = r.arms.investigation;
  const cols: [string, BySplit<StatusMetrics>][] = [
    ["A. Product-name only", r.arms.nameBaseline.metrics],
    ["B. Structured (register only)", r.arms.structured.metrics],
  ];
  if (inv) cols.push(["C. Investigation, after evidence", inv.after]);
  const ev = inv?.evidence;
  const caseRows = inv
    ? inv.cases
        .map((c) => {
          const x = c.extraction;
          const segs = c.segments.map((s) => `${s.trigger}:${s.runStatus ?? "error"}`).join(", ");
          return `| ${c.id} | ${c.expectedRequestFields.join("+") || "-"} | ${c.requestedFields?.join("+") ?? "none"} | ${
            x?.fields ? `${x.fields.gtin_digits ?? "null"} / ${x.fields.lot_text ?? "null"} / ${x.fields.best_before_text ?? "null"}` : "none"
          } | ${x?.ambiguous.map((a) => a.field).join(", ") || "-"} | ${c.statusAfterUnconfirmedExtraction ?? "-"} | ${c.finalStatus ?? "-"} | ${segs} | ${usd(c.costUsd)} | ${sec(c.wallClockMs)} |`;
        })
        .join("\n")
    : "";

  return `# Lotara measured evaluation — results

Generated by \`npm run eval\` (\`scripts/evaluate.ts\`) on ${r.generatedAt}. This file is regenerated from
\`fixtures/evaluation/results/latest.json\`; every number below comes from that run.

## What was run

- Notice: RappelConso ${r.notice.sourceId} v${r.notice.sourceVersion} (saved official snapshot retrieved ${r.notice.retrievedAt}), replayed as history.
  Scope: ${r.notice.entries.join("; ")}. Lot comparison is case-insensitive (the source lowercases text); no O/0 substitution.
- Fixture: ${r.fixture.uniqueCases} unique synthetic delivery cases (${r.fixture.devUnique} dev / ${r.fixture.holdoutUnique} holdout) plus ${r.fixture.duplicateCopies} duplicated register copies, reported separately (${r.fixture.total} rows: ${r.fixture.dev} dev / ${r.fixture.holdout} holdout).
  Gold labels live in \`fixtures/evaluation/gold.json\` and are read only by the scorer after all arms have run; the AI investigator only sees the database.
- Arms:
  - **A. Product-name only** — alert if the product name contains the notice brand or a listed product reference. No uncertainty state.
  - **B. Structured** — deterministic \`evaluateMatch\` on register data only (GTIN, lot, best-before).
  - **C. Investigation with targeted evidence** — ${inv ? `real AI investigator (\`runAiInvestigation\`) on the real database in an isolated \`eval\` tenant (removed afterwards). Requested model \`${r.model.id}\` (effort ${r.model.effort}, prompt ${r.model.promptVersion}); models observed in responses: ${inv.usage.modelsObserved.join(", ") || "none"}. For each case B leaves NEEDS_EVIDENCE: segment 1 (manual) → synthetic label PNG with the true printed values uploaded via \`uploadLabelPhoto\` → segment 2 (evidence_uploaded, model label extraction) → simulated human confirms the TRUE values via \`confirmLabelReading\` → segment 3 (evidence_confirmed). Cases B already resolves keep B's status.` : "not run in this invocation (`--no-ai`)."}
- Seeded database statuses vs arm B: ${r.dbSeedConsistency ? `${r.dbSeedConsistency.mismatches.length} mismatches across ${r.dbSeedConsistency.checked} cases` : "not checked (no database run)"}.

## Headline (unique cases, both splits)

${metricsTable(cols, "overall")}
${inv ? `\nArm C before evidence is identical to arm B by construction (the investigator starts from the same deterministic assessment).\n` : ""}
### Dev split

${metricsTable(cols, "dev")}

### Holdout split

${metricsTable(cols, "holdout")}
${
  inv && ev
    ? `
## Evidence step (arm C)

| Measure | Result |
|---|---|
| Initially unresolved unique cases (B = NEEDS_EVIDENCE) | ${ev.initiallyUnresolvedUnique} |
| Evidence-resolution rate (resolved to the gold status / unresolved cases supplied with sufficient evidence) — overall | ${fmt(ev.evidenceResolution.overall)} |
| — dev | ${fmt(ev.evidenceResolution.dev)} |
| — holdout | ${fmt(ev.evidenceResolution.holdout)} |
| Contradiction cases correctly kept open after evidence | ${fmt(ev.insufficientKeptOpen)} |
| Segment 1 requested exactly the evaluator's missing fields (all investigated rows) | ${fmt(ev.requestedExactly)} |
| Unconfirmed model extraction left status unchanged (NEEDS_EVIDENCE) | ${fmt(ev.unconfirmedExtractionKeptStatus)} |
| Extraction exact match — GTIN digits | ${fmt(ev.extraction.gtin)} |
| Extraction exact match — lot (case-sensitive, as printed) | ${fmt(ev.extraction.lot)} |
| Extraction match — lot (case-insensitive) | ${fmt(ev.extraction.lotCaseInsensitive)} |
| Extraction match — best-before (same calendar date) | ${fmt(ev.extraction.bestBefore)} |
| Rows where extraction raised ambiguity flags | ${ev.ambiguityFlags.length}/${inv.cases.filter((c) => c.extraction).length} rows (only H14's label actually prints a letter O; flags on every row make the flag non-discriminating here): ${ev.ambiguityFlags.length ? ev.ambiguityFlags.map((a) => `${a.id} (${a.flags.map((f) => `${f.field}: ${f.detail}`).join("; ")})`).join("; ") : "none"} |
| Human touches (simulated) | ${ev.humanTouches.total} = ${ev.humanTouches.kitchenUploads} kitchen photo uploads + ${ev.humanTouches.managerConfirmations} manager confirmations, over ${ev.humanTouches.casesTouched} rows |
| Evidence requests created for duplicate register copies | ${ev.duplicateEvidenceRequests} |
| Segments that failed or errored | ${ev.segmentFailures.length ? ev.segmentFailures.map((s) => `${s.id} ${s.trigger} (${s.runStatus ?? "error"}${s.errorCategory ? `, ${s.errorCategory}` : ""})`).join("; ") : "none"} |
${ev.requestMismatches.length ? `\nRequest mismatches: ${ev.requestMismatches.map((m) => `${m.id} expected [${m.expected.join(", ")}], requested [${m.requested?.join(", ") ?? "nothing"}]`).join("; ")}.\n` : ""}${ev.extraction.mismatches.length ? `\nExtraction mismatches: ${ev.extraction.mismatches.map((m) => `${m.id} ${m.field}: printed "${m.truth}", extracted "${m.extracted ?? "null"}"`).join("; ")}.\n` : ""}
Elapsed time is machine processing time of the three segments plus harness steps, not human handling time. Human handling time was not measured (the human was simulated).

## Usage and cost (arm C)

| Measure | Result |
|---|---|
| Segments run | ${inv.usage.segments} |
| Estimated cost (from investigation_runs.cost_usd_est; includes label extraction) | ${usd(inv.usage.costUsd)} total, ${usd(inv.usage.costPerInvestigatedCaseUsd)} per investigated row |
| Tokens (input / output / cache read / cache write) | ${inv.usage.tokens.input} / ${inv.usage.tokens.output} / ${inv.usage.tokens.cacheRead} / ${inv.usage.tokens.cacheWrite} |
| of which label extraction (input / output) | ${inv.usage.extractionTokens.input} / ${inv.usage.extractionTokens.output} |
| Wall-clock per investigated row (mean / min / max) | ${sec(inv.usage.wallClockMsPerCase.mean)} / ${sec(inv.usage.wallClockMsPerCase.min)} / ${sec(inv.usage.wallClockMsPerCase.max)} |
| Segment duration (mean / max) | ${sec(inv.usage.segmentMs.mean)} / ${sec(inv.usage.segmentMs.max)} |
| Total arm C wall-clock | ${sec(inv.usage.wallClockMsTotal)} |
| Budget stop triggered | ${inv.budgetStopped ? "yes — remaining cases were not investigated" : "no"} |

Cost is an estimate from the published per-token price table in \`lib/ai/client.ts\` for the requested model. No prompt caching was used (cache read/write tokens are 0), so most input tokens are the repeated system prompt, tool definitions and tool results across turns.

### Per-row investigation trace

| Case | Expected request | Requested | Extraction (GTIN / lot / date) | Ambiguity flags | Status after unconfirmed extraction | Final | Segments | Cost | Wall-clock |
|---|---|---|---|---|---|---|---|---|---|
${caseRows}
`
    : ""
}
## Duplicate handling

Duplicated register copies (same delivery recorded twice) are excluded from the metrics above.

| Arm | Copies with the same status as the original | Copies detected as duplicates |
|---|---|---|
| A | ${fmt(r.arms.nameBaseline.duplicates.sameStatusAsOriginal)} | ${fmt(r.arms.nameBaseline.duplicates.detectedAsDuplicate)} |
| B | ${fmt(r.arms.structured.duplicates.sameStatusAsOriginal)} | ${fmt(r.arms.structured.duplicates.detectedAsDuplicate)} |
${inv ? `| C | ${fmt(inv.duplicates.sameStatusAsOriginal)} | ${fmt(inv.duplicates.detectedAsDuplicate)} |\n` : ""}
No arm detects duplicate register rows: each copy becomes its own case${inv ? `, and in arm C a duplicated unresolved delivery gets its own evidence request and investigation (${inv.evidence.duplicateEvidenceRequests} extra request(s) in this run) — a duplicate contact attempt the kitchen would see twice` : ""}.

## Failures, listed individually

### A. Product-name only

This arm has no uncertainty state, so it is scored on outcomes only: an alert on a non-affected case, or an affected case not alerted.
It also declares a match on every unresolved case (no lot/GTIN recorded) without any batch evidence; those are counted in precision only when the case is truly affected.

${failureList(r.arms.nameBaseline.failures, NAME_NOTES)}

### B. Structured (register only)

Correct initial uncertainty is not a failure: NEEDS_EVIDENCE is scored against the gold expected status before evidence.

${failureList(r.arms.structured.failures, SYSTEM_NOTES, r.arms.structured.details)}
${inv ? `
### C. Investigation, after evidence

${failureList(inv.failuresAfter, SYSTEM_NOTES, Object.fromEntries(inv.cases.map((c) => [c.id, { reasons: c.finalReasons as ReasonCode[] }])))}
` : ""}
## Limitations

- **Synthetic data.** Deliveries, kitchens and labels are constructed; label photos are clean rendered PNGs, far easier than real phone photos of pouches. Extraction accuracy here says little about real images.
- **Small n, one notice.** ${r.fixture.uniqueCases} unique cases against a single notice with four (GTIN, lot, date) entries. Percentages on denominators this small are fragile; read the counts. A zero-error cell does not establish real-world zero-error operation.
- **Gold labels written by the same team as the system**, from the constructed evidence. They describe the intended interpretation, not real contamination or safety.
- **Simulated human.** The confirming person always types the TRUE printed values, so this measures the pipeline given a perfect reader; it does not measure whether a real manager would catch an extraction error. Human handling time was not measured.
- **Not real incidents.** Historical replay of one official notice; no real kitchen, staff contact or physical removal was involved. No claim of time savings is made.
- **Model nondeterminism.** Arm C ran once; repeated runs can differ in tool order, requests and cost.
- **Design choices visible in the results.** Register/label contradictions intentionally stay NEEDS_EVIDENCE for manager review (the evaluator never lets the newest value win); the confirmation form cannot record a GTIN; duplicate register rows are not detected.
`;
}
