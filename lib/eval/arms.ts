import snapshot from "@/fixtures/development/recall-2026-04-0331.json";
import { evaluateMatch, type Evaluation, type MatchStatus } from "../matching/evaluate";
import { adaptRappelConso, type RappelConsoRecord } from "../recalls/adapter";
import type { RecallScope } from "../recalls/scope";
import type { EvalCase } from "./data";

// The two deterministic arms. Neither reads gold labels.

export function noticeScope(): RecallScope {
  return adaptRappelConso(snapshot.records[0] as unknown as RappelConsoRecord).scope;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Arm A — product-name-only baseline: an alert whenever the product name mentions the
 * notice brand or one of its listed product references. It has no uncertainty state.
 */
export function nameBaseline(scope: RecallScope, c: EvalCase): MatchStatus {
  const name = fold(c.productName);
  const terms = [scope.brand, ...scope.references].map(fold).filter(Boolean);
  return terms.some((t) => name.includes(t)) ? "RECORDED_MATCH" : "NOT_MATCHING_THIS_NOTICE";
}

/** Arm B — structured deterministic matching on register data only. */
export function structuredArm(scope: RecallScope, c: EvalCase): Evaluation {
  return evaluateMatch(scope, { gtinRaw: c.gtin, lotRaw: c.lot, bestBeforeRaw: c.bestBefore });
}
