import type { MatchStatus } from "../matching/evaluate";
import type { EvalCase, GoldLabel, Split } from "./data";

// Blueprint §12 metrics, reported as full counts. Duplicated register copies are
// excluded from the unique-case metrics and reported separately.

export type Ratio = { n: number; d: number; pct: number | null };
export const ratio = (n: number, d: number): Ratio => ({ n, d, pct: d === 0 ? null : Math.round((1000 * n) / d) / 10 });
export const fmt = (r: Ratio) => (r.d === 0 ? "n/a (0/0)" : `${r.n}/${r.d} (${r.pct}%)`);

export type StatusMetrics = {
  uniqueCases: number;
  affected: number;
  declaredRecordedMatch: number;
  needsEvidence: number;
  /** Correct confirmed record matches / all record matches declared. */
  recordedMatchPrecision: Ratio;
  /** Affected cases flagged RECORDED_MATCH or NEEDS_EVIDENCE / all affected. */
  triageRecall: Ratio;
  /** Affected cases declared RECORDED_MATCH / all affected. */
  confirmedMatchRecall: Ratio;
  /** Affected cases marked NOT_MATCHING_THIS_NOTICE / all affected. */
  incorrectExclusionRate: Ratio;
  /** Non-affected cases that raised an alert or an evidence request / all non-affected. */
  falseAlertRate: Ratio;
  /** Status equals the gold expected status for this stage. */
  agreementWithExpected: Ratio;
};

export type Scored = { id: string; split: Split; status: MatchStatus; duplicateOf?: string };

export function statusMetrics(rows: Scored[], gold: Map<string, GoldLabel>, stage: "before" | "after"): StatusMetrics {
  const unique = rows.filter((r) => !r.duplicateOf);
  const g = (id: string) => {
    const label = gold.get(id);
    if (!label) throw new Error(`No gold label for ${id}`);
    return label;
  };
  const affected = unique.filter((r) => g(r.id).affected);
  const notAffected = unique.filter((r) => !g(r.id).affected);
  const declared = unique.filter((r) => r.status === "RECORDED_MATCH");
  const expected = (r: Scored) => (stage === "after" ? (g(r.id).expectedAfter ?? g(r.id).expectedBefore) : g(r.id).expectedBefore);
  return {
    uniqueCases: unique.length,
    affected: affected.length,
    declaredRecordedMatch: declared.length,
    needsEvidence: unique.filter((r) => r.status === "NEEDS_EVIDENCE").length,
    recordedMatchPrecision: ratio(declared.filter((r) => g(r.id).affected).length, declared.length),
    triageRecall: ratio(affected.filter((r) => r.status !== "NOT_MATCHING_THIS_NOTICE").length, affected.length),
    confirmedMatchRecall: ratio(affected.filter((r) => r.status === "RECORDED_MATCH").length, affected.length),
    incorrectExclusionRate: ratio(affected.filter((r) => r.status === "NOT_MATCHING_THIS_NOTICE").length, affected.length),
    falseAlertRate: ratio(notAffected.filter((r) => r.status !== "NOT_MATCHING_THIS_NOTICE").length, notAffected.length),
    agreementWithExpected: ratio(unique.filter((r) => r.status === expected(r)).length, unique.length),
  };
}

export type BySplit<T> = { dev: T; holdout: T; overall: T };

export function bySplit<T>(rows: Scored[], fn: (rows: Scored[]) => T): BySplit<T> {
  return {
    dev: fn(rows.filter((r) => r.split === "dev")),
    holdout: fn(rows.filter((r) => r.split === "holdout")),
    overall: fn(rows),
  };
}

export type DuplicateReport = {
  copies: number;
  /** Duplicate copy received the same status as its original. */
  sameStatusAsOriginal: Ratio;
  /** Arm flagged the copy as a duplicate of an existing delivery (none of the arms can). */
  detectedAsDuplicate: Ratio;
  details: { id: string; duplicateOf: string; status: MatchStatus; originalStatus: MatchStatus }[];
};

export function duplicateReport(rows: Scored[]): DuplicateReport {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const copies = rows.filter((r) => r.duplicateOf);
  const details = copies.map((r) => ({ id: r.id, duplicateOf: r.duplicateOf!, status: r.status, originalStatus: byId.get(r.duplicateOf!)!.status }));
  return {
    copies: copies.length,
    sameStatusAsOriginal: ratio(details.filter((d) => d.status === d.originalStatus).length, details.length),
    detectedAsDuplicate: ratio(0, details.length),
    details,
  };
}

export type CaseFailure = { id: string; split: Split; stage: "before" | "after"; got: MatchStatus; expected: MatchStatus; affected: boolean; category: string; rationale: string };

/**
 * "status" mode: wrong vs the gold expected status, or an affected case excluded.
 * "outcome" mode (for an arm with no uncertainty state): an alert on a non-affected
 * case, or an affected case excluded.
 */
export function failures(rows: Scored[], gold: Map<string, GoldLabel>, stage: "before" | "after", mode: "status" | "outcome" = "status"): CaseFailure[] {
  return rows.flatMap((r) => {
    const g = gold.get(r.id)!;
    const expected = stage === "after" ? (g.expectedAfter ?? g.expectedBefore) : g.expectedBefore;
    // An affected case wrongly excluded is a failure even when the register-only expectation agrees.
    const wrongExclusion = g.affected && r.status === "NOT_MATCHING_THIS_NOTICE";
    const ok = mode === "outcome" ? !wrongExclusion && (g.affected || r.status === "NOT_MATCHING_THIS_NOTICE") : r.status === expected && !wrongExclusion;
    if (ok) return [];
    return [{ id: r.id, split: r.split, stage, got: r.status, expected, affected: g.affected, category: g.category, rationale: g.rationale }];
  });
}

export const toScored = (cases: EvalCase[], status: (c: EvalCase) => MatchStatus): Scored[] =>
  cases.map((c) => ({ id: c.id, split: c.split, status: status(c), duplicateOf: c.duplicateOf }));
