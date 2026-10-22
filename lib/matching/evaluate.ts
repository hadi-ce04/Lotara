import type { RecallScope, ScopeEntry } from "../recalls/scope";
import { lotsEqual, normalizeDate, normalizeGtin, normalizeLot } from "./normalize";

// Deterministic recall predicates. The model (later) may extract and explain;
// only this code decides match status, and no confidence score can clear a batch.

export type MatchStatus = "RECORDED_MATCH" | "NOT_MATCHING_THIS_NOTICE" | "NEEDS_EVIDENCE";
export type EvidenceField = "lot" | "best_before" | "gtin";

export type ReasonCode =
  | "GTIN_MISSING"
  | "GTIN_INVALID"
  | "GTIN_CONFLICT"
  | "GTIN_NOT_IN_NOTICE"
  | "GTIN_IN_NOTICE"
  | "ALL_LOTS_FOR_GTIN"
  | "LOT_MISSING"
  | "LOT_CONFLICT"
  | "LOT_LISTED"
  | "LOT_NOT_LISTED"
  | "LOT_LISTED_UNDER_OTHER_GTIN_ONLY"
  | "DATE_CONFIRMED"
  | "DATE_NOT_RECORDED"
  | "DATE_CONFLICT"
  | "DATE_UNREADABLE"
  | "UNSUPPORTED_NOTICE_CRITERIA";

export type RecordedLot = {
  gtinRaw: string | null;
  lotRaw: string | null;
  bestBeforeRaw: string | null;
};

/** Human-confirmed values read from uploaded evidence, oldest first. */
export type ConfirmedEvidence = { field: EvidenceField; value: string; evidenceId: string }[];

export type Evaluation = {
  status: MatchStatus;
  reasons: ReasonCode[];
  missingFields: EvidenceField[];
  matchedEntry: ScopeEntry | null;
  effective: {
    gtin: { value: string | null; source: "register" | "evidence" | null };
    lot: { value: string | null; source: "register" | "evidence" | null };
    bestBefore: { value: string | null; source: "register" | "evidence" | null };
  };
};

type Effective<T> = { value: T | null; source: "register" | "evidence" | null; conflict: boolean };

function resolveField(
  registerValue: string | null,
  evidence: string[],
  equal: (a: string, b: string) => boolean,
): Effective<string> {
  const values = [...(registerValue ? [registerValue] : []), ...evidence];
  if (values.length === 0) return { value: null, source: null, conflict: false };
  // Any disagreement between register and evidence, or between two pieces of
  // evidence, reopens review instead of letting the newest value win silently.
  const conflict = values.some((v) => !equal(v, values[0]));
  return { value: values[0], source: registerValue ? "register" : "evidence", conflict };
}

export function evaluateMatch(
  scope: RecallScope,
  recorded: RecordedLot,
  evidence: ConfirmedEvidence = [],
): Evaluation {
  const reasons: ReasonCode[] = [];
  const missing = new Set<EvidenceField>();
  const fromEvidence = (field: EvidenceField) => evidence.filter((e) => e.field === field).map((e) => e.value);

  const gtin = resolveField(normalizeLot(recorded.gtinRaw), fromEvidence("gtin").map((v) => v.trim()), (a, b) => {
    const na = normalizeGtin(a);
    const nb = normalizeGtin(b);
    return na.ok && nb.ok ? na.gtin14 === nb.gtin14 : a === b;
  });
  const lot = resolveField(
    normalizeLot(recorded.lotRaw),
    fromEvidence("lot").map((v) => normalizeLot(v)).filter((v): v is string => v !== null),
    (a, b) => lotsEqual(a, b, scope.lotCaseInsensitive),
  );
  const dateRaw = resolveField(normalizeLot(recorded.bestBeforeRaw), fromEvidence("best_before"), (a, b) => {
    const da = normalizeDate(a);
    return da !== null && da === normalizeDate(b);
  });

  const effective: Evaluation["effective"] = {
    gtin: { value: gtin.value, source: gtin.source },
    lot: { value: lot.value, source: lot.source },
    bestBefore: { value: dateRaw.value, source: dateRaw.source },
  };
  const result = (status: MatchStatus, matchedEntry: ScopeEntry | null = null): Evaluation => ({
    status,
    reasons,
    missingFields: [...missing],
    matchedEntry,
    effective,
  });

  if (scope.unsupportedCriteria.length > 0) {
    reasons.push("UNSUPPORTED_NOTICE_CRITERIA");
    return result("NEEDS_EVIDENCE");
  }

  // 1. Product identity by GTIN.
  if (!gtin.value) {
    reasons.push("GTIN_MISSING");
    missing.add("gtin");
    return result("NEEDS_EVIDENCE");
  }
  if (gtin.conflict) {
    reasons.push("GTIN_CONFLICT");
    missing.add("gtin");
    return result("NEEDS_EVIDENCE");
  }
  const gtinNorm = normalizeGtin(gtin.value);
  if (!gtinNorm.ok) {
    reasons.push("GTIN_INVALID");
    missing.add("gtin");
    return result("NEEDS_EVIDENCE");
  }
  const forGtin = scope.entries.filter((e) => e.gtin14 === gtinNorm.gtin14);
  if (forGtin.length === 0) {
    reasons.push("GTIN_NOT_IN_NOTICE");
    return result("NOT_MATCHING_THIS_NOTICE");
  }
  reasons.push("GTIN_IN_NOTICE");

  const allLots = forGtin.find((e) => e.allLots);
  if (allLots) {
    reasons.push("ALL_LOTS_FOR_GTIN");
    return result("RECORDED_MATCH", allLots);
  }

  // 2. Batch.
  if (lot.conflict) {
    reasons.push("LOT_CONFLICT");
    missing.add("lot");
    return result("NEEDS_EVIDENCE");
  }
  if (!lot.value) {
    reasons.push("LOT_MISSING");
    missing.add("lot");
    if (!dateRaw.value) missing.add("best_before");
    return result("NEEDS_EVIDENCE");
  }
  const lotValue = lot.value;
  const entry = forGtin.find((e) => e.lot !== null && lotsEqual(e.lot, lotValue, scope.lotCaseInsensitive));
  if (!entry) {
    reasons.push("LOT_NOT_LISTED");
    const elsewhere = scope.entries.some(
      (e) => e.lot !== null && e.gtin14 !== gtinNorm.gtin14 && lotsEqual(e.lot, lotValue, scope.lotCaseInsensitive),
    );
    if (elsewhere) reasons.push("LOT_LISTED_UNDER_OTHER_GTIN_ONLY");
    return result("NOT_MATCHING_THIS_NOTICE");
  }
  reasons.push("LOT_LISTED");

  // 3. Date: a consistency check against the listed (GTIN, lot) entry.
  if (entry.date) {
    if (dateRaw.conflict) {
      reasons.push("DATE_CONFLICT");
      missing.add("best_before");
      return result("NEEDS_EVIDENCE");
    }
    if (!dateRaw.value) {
      reasons.push("DATE_NOT_RECORDED");
    } else {
      const date = normalizeDate(dateRaw.value);
      if (!date) {
        reasons.push("DATE_UNREADABLE");
        missing.add("best_before");
        return result("NEEDS_EVIDENCE");
      }
      if (date !== entry.date) {
        reasons.push("DATE_CONFLICT");
        missing.add("best_before");
        return result("NEEDS_EVIDENCE");
      }
      reasons.push("DATE_CONFIRMED");
    }
  }
  return result("RECORDED_MATCH", entry);
}

export const REASON_TEXT: Record<ReasonCode, string> = {
  GTIN_MISSING: "No GTIN is recorded for this delivery.",
  GTIN_INVALID: "The recorded GTIN fails format or check-digit validation.",
  GTIN_CONFLICT: "Recorded and confirmed GTINs disagree.",
  GTIN_NOT_IN_NOTICE: "The GTIN is not listed in this notice.",
  GTIN_IN_NOTICE: "The GTIN is listed in this notice.",
  ALL_LOTS_FOR_GTIN: "The notice explicitly covers all lots for this GTIN.",
  LOT_MISSING: "No lot code is recorded, so the batch cannot be resolved.",
  LOT_CONFLICT: "Lot codes from different evidence disagree; review reopened.",
  LOT_LISTED: "The lot code is listed for this GTIN in the notice.",
  LOT_NOT_LISTED: "The lot code is not listed for this GTIN in the notice.",
  LOT_LISTED_UNDER_OTHER_GTIN_ONLY: "This lot code appears in the notice only under a different GTIN.",
  DATE_CONFIRMED: "The best-before date matches the notice entry.",
  DATE_NOT_RECORDED: "No best-before date recorded; GTIN and lot alone satisfy the listed entry.",
  DATE_CONFLICT: "The best-before date disagrees with the notice entry for this lot.",
  DATE_UNREADABLE: "The best-before date could not be read as a date.",
  UNSUPPORTED_NOTICE_CRITERIA: "The notice has criteria this prototype cannot evaluate; manual review required.",
};
