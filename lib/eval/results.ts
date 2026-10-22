import type { EvidenceField, MatchStatus, ReasonCode } from "../matching/evaluate";
import type { AiCaseRecord } from "./ai-arm";
import type { EvalCase, GoldLabel } from "./data";
import {
  bySplit, duplicateReport, failures, ratio, statusMetrics, toScored,
  type BySplit, type CaseFailure, type DuplicateReport, type Ratio, type StatusMetrics,
} from "./metrics";

// Assembles machine-readable results. Called after all arms have run; this is the
// only place gold labels are combined with arm outputs.

export type DeterministicOutputs = {
  name: Map<string, MatchStatus>;
  structured: Map<string, { status: MatchStatus; reasons: ReasonCode[]; missingFields: EvidenceField[] }>;
};

export type ArmResult = {
  metrics: BySplit<StatusMetrics>;
  duplicates: DuplicateReport;
  failures: CaseFailure[];
  statuses: Record<string, MatchStatus>;
};

export type InvestigationResult = {
  ran: boolean;
  budgetStopped: boolean;
  before: BySplit<StatusMetrics>;
  after: BySplit<StatusMetrics>;
  duplicates: DuplicateReport;
  failuresBefore: CaseFailure[];
  failuresAfter: CaseFailure[];
  statuses: Record<string, MatchStatus>;
  evidence: {
    initiallyUnresolvedUnique: number;
    evidenceResolution: BySplit<Ratio>;
    insufficientKeptOpen: Ratio;
    requestedExactly: Ratio;
    requestMismatches: { id: string; expected: string[]; requested: string[] | null }[];
    unconfirmedExtractionKeptStatus: Ratio;
    extraction: { gtin: Ratio; lot: Ratio; lotCaseInsensitive: Ratio; bestBefore: Ratio; mismatches: { id: string; field: string; truth: string; extracted: string | null }[] };
    ambiguityFlags: { id: string; flags: { field: string; detail: string }[] }[];
    humanTouches: { kitchenUploads: number; managerConfirmations: number; total: number; casesTouched: number };
    duplicateEvidenceRequests: number;
    segmentFailures: { id: string; trigger: string; runStatus: string | null; errorCategory: string | null }[];
  };
  usage: {
    segments: number;
    costUsd: number;
    costPerInvestigatedCaseUsd: number | null;
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
    extractionTokens: { input: number; output: number };
    wallClockMsTotal: number;
    wallClockMsPerCase: { mean: number | null; min: number | null; max: number | null };
    segmentMs: { mean: number | null; max: number | null };
    modelsObserved: string[];
  };
  cases: AiCaseRecord[];
};

const statusMap = (rows: { id: string; status: MatchStatus }[]) => Object.fromEntries(rows.map((r) => [r.id, r.status]));

export function scoreDeterministic(cases: EvalCase[], out: DeterministicOutputs, gold: Map<string, GoldLabel>) {
  const arm = (status: (c: EvalCase) => MatchStatus, mode: "status" | "outcome"): ArmResult => {
    const rows = toScored(cases, status);
    return {
      metrics: bySplit(rows, (r) => statusMetrics(r, gold, "before")),
      duplicates: duplicateReport(rows),
      failures: failures(rows, gold, "before", mode),
      statuses: statusMap(rows),
    };
  };
  return {
    nameBaseline: arm((c) => out.name.get(c.id)!, "outcome"),
    structured: { ...arm((c) => out.structured.get(c.id)!.status, "status"), details: Object.fromEntries(out.structured) },
  };
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function scoreInvestigation(
  cases: EvalCase[], out: DeterministicOutputs, ai: { records: AiCaseRecord[]; budgetStopped: boolean } | null, gold: Map<string, GoldLabel>,
): InvestigationResult {
  const records = new Map((ai?.records ?? []).map((r) => [r.id, r]));
  const initial = (c: EvalCase) => out.structured.get(c.id)!.status;
  const final = (c: EvalCase): MatchStatus => (initial(c) === "NEEDS_EVIDENCE" ? (records.get(c.id)?.finalStatus ?? "NEEDS_EVIDENCE") : initial(c));
  const beforeRows = toScored(cases, initial);
  const afterRows = toScored(cases, final);
  const ran = [...records.values()].filter((r) => r.ran);
  const unique = cases.filter((c) => !c.duplicateOf);
  const g = (id: string) => gold.get(id)!;

  const resolution = (subset: EvalCase[]) => {
    const pool = subset.filter((c) => !c.duplicateOf && initial(c) === "NEEDS_EVIDENCE" && g(c.id).evidenceSufficient && records.get(c.id)?.ran);
    return ratio(pool.filter((c) => final(c) !== "NEEDS_EVIDENCE" && final(c) === g(c.id).expectedAfter).length, pool.length);
  };
  const insufficient = unique.filter((c) => initial(c) === "NEEDS_EVIDENCE" && g(c.id).evidenceSufficient === false && records.get(c.id)?.ran);
  const withX = ran.filter((r) => r.extraction?.correct);
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const mismatches = withX.flatMap((r) => {
    const t = caseById.get(r.id)!.label!;
    const f = r.extraction!.fields!;
    const out: { id: string; field: string; truth: string; extracted: string | null }[] = [];
    if (!r.extraction!.correct!.gtin) out.push({ id: r.id, field: "gtin", truth: t.gtin, extracted: f.gtin_digits });
    if (!r.extraction!.correct!.lot) out.push({ id: r.id, field: "lot", truth: t.lot, extracted: f.lot_text });
    if (!r.extraction!.correct!.bestBefore) out.push({ id: r.id, field: "best_before", truth: t.bestBefore, extracted: f.best_before_text });
    return out;
  });
  const segs = ran.flatMap((r) => r.segments);
  const tokens = segs.reduce(
    (a, s) => ({ input: a.input + s.tokens.input, output: a.output + s.tokens.output, cacheRead: a.cacheRead + s.tokens.cacheRead, cacheWrite: a.cacheWrite + s.tokens.cacheWrite }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const cost = segs.reduce((a, s) => a + (s.costUsd ?? 0), 0);
  const wall = ran.map((r) => r.wallClockMs);
  const segMs = segs.map((s) => s.elapsedMs).filter((x): x is number => x !== null);
  const kitchen = ran.reduce((a, r) => a + r.humanTouches.kitchenUpload, 0);
  const manager = ran.reduce((a, r) => a + r.humanTouches.managerConfirmation, 0);

  return {
    ran: ai !== null,
    budgetStopped: ai?.budgetStopped ?? false,
    before: bySplit(beforeRows, (r) => statusMetrics(r, gold, "before")),
    after: bySplit(afterRows, (r) => statusMetrics(r, gold, "after")),
    duplicates: duplicateReport(afterRows),
    failuresBefore: failures(beforeRows, gold, "before"),
    failuresAfter: failures(afterRows, gold, "after"),
    statuses: statusMap(afterRows),
    evidence: {
      initiallyUnresolvedUnique: unique.filter((c) => initial(c) === "NEEDS_EVIDENCE").length,
      evidenceResolution: {
        dev: resolution(cases.filter((c) => c.split === "dev")),
        holdout: resolution(cases.filter((c) => c.split === "holdout")),
        overall: resolution(cases),
      },
      insufficientKeptOpen: ratio(insufficient.filter((c) => final(c) === "NEEDS_EVIDENCE").length, insufficient.length),
      requestedExactly: ratio(ran.filter((r) => r.requestedExactly).length, ran.length),
      requestMismatches: ran.filter((r) => !r.requestedExactly).map((r) => ({ id: r.id, expected: r.expectedRequestFields, requested: r.requestedFields })),
      unconfirmedExtractionKeptStatus: ratio(ran.filter((r) => r.statusAfterUnconfirmedExtraction === "NEEDS_EVIDENCE").length, ran.length),
      extraction: {
        gtin: ratio(withX.filter((r) => r.extraction!.correct!.gtin).length, withX.length),
        lot: ratio(withX.filter((r) => r.extraction!.correct!.lot).length, withX.length),
        lotCaseInsensitive: ratio(withX.filter((r) => r.extraction!.correct!.lotCaseInsensitive).length, withX.length),
        bestBefore: ratio(withX.filter((r) => r.extraction!.correct!.bestBefore).length, withX.length),
        mismatches,
      },
      ambiguityFlags: ran.filter((r) => (r.extraction?.ambiguous.length ?? 0) > 0).map((r) => ({ id: r.id, flags: r.extraction!.ambiguous })),
      humanTouches: { kitchenUploads: kitchen, managerConfirmations: manager, total: kitchen + manager, casesTouched: ran.filter((r) => r.humanTouches.kitchenUpload + r.humanTouches.managerConfirmation > 0).length },
      duplicateEvidenceRequests: ran.filter((r) => caseById.get(r.id)!.duplicateOf && r.requestedFields !== null).length,
      segmentFailures: ran.flatMap((r) => r.segments.filter((s) => s.runStatus === "FAILED" || s.runStatus === null).map((s) => ({ id: r.id, trigger: s.trigger, runStatus: s.runStatus, errorCategory: s.errorCategory }))),
    },
    usage: {
      segments: segs.length,
      costUsd: Math.round(cost * 10000) / 10000,
      costPerInvestigatedCaseUsd: ran.length ? Math.round((cost / ran.length) * 10000) / 10000 : null,
      tokens,
      extractionTokens: ran.reduce((a, r) => ({ input: a.input + (r.extraction?.tokens?.input ?? 0), output: a.output + (r.extraction?.tokens?.output ?? 0) }), { input: 0, output: 0 }),
      wallClockMsTotal: wall.reduce((a, b) => a + b, 0),
      wallClockMsPerCase: { mean: mean(wall), min: wall.length ? Math.min(...wall) : null, max: wall.length ? Math.max(...wall) : null },
      segmentMs: { mean: mean(segMs), max: segMs.length ? Math.max(...segMs) : null },
      modelsObserved: [...new Set(segs.flatMap((s) => (s.model ? s.model.split(", ") : [])).concat(ran.flatMap((r) => (r.extraction?.model ? [r.extraction.model] : []))))],
    },
    cases: [...records.values()],
  };
}
