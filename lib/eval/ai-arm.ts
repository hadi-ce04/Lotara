import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAiInvestigation } from "../ai/investigate";
import { CaseError, confirmLabelReading, getCaseDetail, uploadLabelPhoto } from "../cases";
import { getPool } from "../db";
import type { EvidenceField, MatchStatus } from "../matching/evaluate";
import { normalizeDate } from "../matching/normalize";
import type { EvalCase } from "./data";

// Arm C — investigation with targeted evidence collection on the real database and
// the real AI investigator. Three segments per unresolved case:
//   1. manual           -> should request exactly the missing fields
//   2. evidence_uploaded -> synthetic label photo with the TRUE values; model extraction
//   3. evidence_confirmed -> after a simulated human confirms the TRUE values
// Gold labels are not available here; only register data and the physical label truth
// (needed to render the photo and to simulate the human reader).

export type SegmentRecord = {
  trigger: string;
  runStatus: string | null;
  errorCategory: string | null;
  caseStatusAfter: MatchStatus | null;
  tools: string[];
  elapsedMs: number | null;
  costUsd: number | null;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  model: string | null;
  summary: string | null;
};

export type ExtractionRecord = {
  status: string | null;
  model: string | null;
  fields: { gtin_digits: string | null; lot_text: string | null; best_before_text: string | null; legible: boolean | null } | null;
  ambiguous: { field: string; detail: string }[];
  correct: { gtin: boolean; lot: boolean; lotCaseInsensitive: boolean; bestBefore: boolean } | null;
  tokens: { input: number; output: number } | null;
  elapsedMs: number | null;
};

export type AiCaseRecord = {
  id: string;
  ran: boolean;
  skippedReason: string | null;
  expectedRequestFields: EvidenceField[];
  requestedFields: string[] | null;
  requestedExactly: boolean | null;
  segments: SegmentRecord[];
  extraction: ExtractionRecord | null;
  statusAfterUnconfirmedExtraction: MatchStatus | null;
  confirmation: { lot: string; bestBefore: string; error: string | null; method: string[] } | null;
  humanTouches: { kitchenUpload: number; managerConfirmation: number };
  finalStatus: MatchStatus | null;
  finalReasons: string[];
  wallClockMs: number;
  costUsd: number;
  errors: string[];
};

export class BudgetExceeded extends Error {}

const safeError = (err: unknown) => (err instanceof CaseError ? `CaseError: ${err.message}` : err instanceof Error ? err.name : "unknown");
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

async function tenantCost(tenantId: string): Promise<number> {
  const { rows: [r] } = await getPool().query(`SELECT COALESCE(sum(cost_usd_est), 0)::float AS c FROM investigation_runs WHERE tenant_id = $1`, [tenantId]);
  return Number(r.c);
}

async function segmentRecord(tenantId: string, caseId: string, runId: string | null, trigger: string, err: string | null): Promise<SegmentRecord> {
  const detail = await getCaseDetail(tenantId, caseId);
  const status = (detail?.case.match_status ?? null) as MatchStatus | null;
  if (!runId) {
    return { trigger, runStatus: null, errorCategory: err, caseStatusAfter: status, tools: [], elapsedMs: null, costUsd: null,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: null, summary: null };
  }
  const pool = getPool();
  const { rows: [run] } = await pool.query(
    `SELECT status, error_category, usage, cost_usd_est, model_id, summary,
            EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000 AS ms
       FROM investigation_runs WHERE tenant_id = $1 AND id = $2`,
    [tenantId, runId],
  );
  const { rows: steps } = await pool.query(`SELECT tool_name FROM run_steps WHERE run_id = $1 AND kind = 'tool' ORDER BY step_index`, [runId]);
  const u = run.usage ?? {};
  return {
    trigger,
    runStatus: run.status,
    errorCategory: run.error_category ?? err,
    caseStatusAfter: status,
    tools: steps.map((s) => s.tool_name),
    elapsedMs: run.ms === null ? null : Math.round(Number(run.ms)),
    costUsd: run.cost_usd_est === null ? null : Number(run.cost_usd_est),
    tokens: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
    model: run.model_id,
    summary: run.summary,
  };
}

function renderLabel(dir: string, c: EvalCase): Buffer {
  const label = c.label!;
  const out = path.join(dir, `${c.id}.png`);
  execFileSync("python", ["-I", path.join(process.cwd(), "scripts", "make-eval-label.py"), out, label.gtin, label.lot, label.bestBefore], { stdio: "ignore" });
  return readFileSync(out);
}

export type AiArmOptions = {
  tenantId: string;
  actorId: string;
  budgetUsd: number;
  /** Conservative reserve per remaining segment when checking the budget. */
  segmentReserveUsd: number;
  log: (line: string) => void;
};

export async function runAiCase(
  opts: AiArmOptions, c: EvalCase, caseId: string, expectedRequestFields: EvidenceField[], workDir: string,
): Promise<AiCaseRecord> {
  const { tenantId, actorId } = opts;
  const rec: AiCaseRecord = {
    id: c.id, ran: true, skippedReason: null, expectedRequestFields, requestedFields: null, requestedExactly: null,
    segments: [], extraction: null, statusAfterUnconfirmedExtraction: null, confirmation: null,
    humanTouches: { kitchenUpload: 0, managerConfirmation: 0 }, finalStatus: null, finalReasons: [], wallClockMs: 0, costUsd: 0, errors: [],
  };
  const started = Date.now();
  const budgetOk = async () => (await tenantCost(tenantId)) + opts.segmentReserveUsd <= opts.budgetUsd;

  const segment = async (trigger: "manual" | "evidence_uploaded" | "evidence_confirmed") => {
    if (!(await budgetOk())) throw new BudgetExceeded();
    let runId: string | null = null;
    let err: string | null = null;
    try {
      runId = (await runAiInvestigation(tenantId, caseId, actorId, trigger)).runId;
    } catch (e) {
      err = safeError(e);
      rec.errors.push(`${trigger}: ${err}`);
    }
    const s = await segmentRecord(tenantId, caseId, runId, trigger, err);
    rec.segments.push(s);
    opts.log(`  ${c.id} ${trigger}: run=${s.runStatus} case=${s.caseStatusAfter} tools=[${s.tools.join(",")}] $${(s.costUsd ?? 0).toFixed(4)}${s.errorCategory ? ` err=${s.errorCategory}` : ""}`);
    return s;
  };

  try {
    // Segment 1: targeted evidence request.
    await segment("manual");
    let detail = (await getCaseDetail(tenantId, caseId))!;
    const open = detail.requests.find((r) => r.status === "OPEN");
    rec.requestedFields = open ? (open.requested_fields as string[]) : null;
    rec.requestedExactly = open ? sameSet(open.requested_fields, expectedRequestFields) : false;

    // Kitchen uploads a photo of the physical label (TRUE values).
    if (!c.label) throw new Error("case has no label truth");
    const png = renderLabel(workDir, c);
    const documentId = await uploadLabelPhoto(
      { tenantId, actorId: `participant:${c.site}`, siteId: c.site }, caseId,
      new File([new Uint8Array(png)], `${c.id}.png`, { type: "image/png" }),
    );
    rec.humanTouches.kitchenUpload++;

    // Segment 2: model extraction (unconfirmed).
    const s2 = await segment("evidence_uploaded");
    rec.statusAfterUnconfirmedExtraction = s2.caseStatusAfter;
    const { rows: [x] } = await getPool().query(
      `SELECT status, model_id, fields, usage, elapsed_ms FROM label_extractions WHERE tenant_id = $1 AND document_id = $2`,
      [tenantId, documentId],
    );
    if (x) {
      const f = x.fields;
      const truth = c.label;
      rec.extraction = {
        status: x.status,
        model: x.model_id,
        fields: f ? { gtin_digits: f.gtin_digits, lot_text: f.lot_text, best_before_text: f.best_before_text, legible: f.legible } : null,
        ambiguous: f?.ambiguous ?? [],
        correct: f
          ? {
              gtin: (f.gtin_digits ?? "").replace(/\s/g, "") === truth.gtin,
              lot: (f.lot_text ?? "").trim() === truth.lot,
              lotCaseInsensitive: (f.lot_text ?? "").trim().toLowerCase() === truth.lot.toLowerCase(),
              bestBefore: normalizeDate(f.best_before_text) !== null && normalizeDate(f.best_before_text) === normalizeDate(truth.bestBefore),
            }
          : null,
        tokens: x.usage ? { input: x.usage.input_tokens ?? 0, output: x.usage.output_tokens ?? 0 } : null,
        elapsedMs: x.elapsed_ms,
      };
    } else {
      rec.errors.push("evidence_uploaded: no extraction was made for the uploaded photo");
    }

    // Simulated human confirmation with the TRUE label values.
    detail = (await getCaseDetail(tenantId, caseId))!;
    rec.confirmation = { lot: c.label.lot, bestBefore: c.label.bestBefore, error: null, method: [] };
    try {
      await confirmLabelReading(tenantId, actorId, {
        caseId, documentId, expectedVersion: detail.case.version, lot: c.label.lot, bestBefore: c.label.bestBefore,
      });
      rec.humanTouches.managerConfirmation++;
      const { rows } = await getPool().query(
        `SELECT field_name, extraction_method FROM evidence_items WHERE tenant_id = $1 AND document_id = $2 ORDER BY field_name`,
        [tenantId, documentId],
      );
      rec.confirmation.method = rows.map((r) => `${r.field_name}:${r.extraction_method}`);
    } catch (e) {
      rec.confirmation.error = safeError(e);
      rec.errors.push(`confirm: ${rec.confirmation.error}`);
    }

    // Segment 3: conclusion after confirmed evidence.
    await segment("evidence_confirmed");
  } catch (e) {
    if (e instanceof BudgetExceeded) {
      rec.skippedReason = "budget";
      rec.ran = rec.segments.length > 0;
    } else {
      rec.errors.push(`harness: ${safeError(e)}`);
    }
  }
  const last = await getCaseDetail(tenantId, caseId);
  rec.finalStatus = (last?.case.match_status ?? null) as MatchStatus | null;
  rec.finalReasons = last?.case.reason_codes ?? [];
  rec.wallClockMs = Date.now() - started;
  rec.costUsd = rec.segments.reduce((s, x) => s + (x.costUsd ?? 0), 0);
  return rec;
}


export async function runAiArm(
  opts: AiArmOptions,
  targets: { c: EvalCase; caseId: string; expectedRequestFields: EvidenceField[] }[],
): Promise<{ records: AiCaseRecord[]; budgetStopped: boolean }> {
  const workDir = mkdtempSync(path.join(os.tmpdir(), "lotara-eval-"));
  const records: AiCaseRecord[] = [];
  let budgetStopped = false;
  try {
    for (const t of targets) {
      if (budgetStopped) {
        records.push({
          id: t.c.id, ran: false, skippedReason: "budget", expectedRequestFields: t.expectedRequestFields, requestedFields: null,
          requestedExactly: null, segments: [], extraction: null, statusAfterUnconfirmedExtraction: null, confirmation: null,
          humanTouches: { kitchenUpload: 0, managerConfirmation: 0 }, finalStatus: "NEEDS_EVIDENCE", finalReasons: [], wallClockMs: 0, costUsd: 0, errors: [],
        });
        continue;
      }
      opts.log(`AI arm: ${t.c.id}`);
      const rec = await runAiCase(opts, t.c, t.caseId, t.expectedRequestFields, workDir);
      records.push(rec);
      if (rec.skippedReason === "budget") {
        budgetStopped = true;
        opts.log(`Budget limit reached (US$${opts.budgetUsd}); stopping the AI arm.`);
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  return { records, budgetStopped };
}
