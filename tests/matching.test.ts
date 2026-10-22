import { describe, expect, it } from "vitest";
import snapshot from "../fixtures/development/recall-2026-04-0331.json";
import { adaptRappelConso, parseIdentification, UnsupportedScopeError, type RappelConsoRecord } from "../lib/recalls/adapter";
import { evaluateMatch, type ConfirmedEvidence } from "../lib/matching/evaluate";
import { normalizeDate, normalizeGtin } from "../lib/matching/normalize";

const notice = adaptRappelConso(snapshot.records[0] as unknown as RappelConsoRecord);
const scope = notice.scope;
const GTIN_A = "4056489470458"; // lots k100, k101
const GTIN_B = "4056489470441"; // lots k099, k100

describe("RappelConso adapter", () => {
  it("parses the official notice into (GTIN, lot, date) entries", () => {
    expect(notice.sourceId).toBe("2026-04-0331");
    expect(scope.entries).toEqual([
      { gtin14: "0" + GTIN_A, gtinRaw: GTIN_A, lot: "k100", allLots: false, dateType: "best_before", date: "2026-12-10" },
      { gtin14: "0" + GTIN_A, gtinRaw: GTIN_A, lot: "k101", allLots: false, dateType: "best_before", date: "2026-12-11" },
      { gtin14: "0" + GTIN_B, gtinRaw: GTIN_B, lot: "k099", allLots: false, dateType: "best_before", date: "2026-12-09" },
      { gtin14: "0" + GTIN_B, gtinRaw: GTIN_B, lot: "k100", allLots: false, dateType: "best_before", date: "2026-12-10" },
    ]);
    expect(scope.references).toEqual(["compote bio pomme banane", "compote bio pomme fraise"]);
  });

  it("represents 'all lots' explicitly and never treats a missing lot as all lots", () => {
    expect(parseIdentification([GTIN_A, "tous les lots", "non concerné"])[0]).toMatchObject({ allLots: true, lot: null });
    expect(() => parseIdentification(["3564700416037", "/", "date de durabilité minimale", "2024-06-05"])).toThrow(UnsupportedScopeError);
  });
});

describe("normalization", () => {
  it("keeps leading zeroes and validates check digits", () => {
    expect(normalizeGtin("04056489470458")).toEqual({ ok: true, gtin14: "04056489470458" });
    expect(normalizeGtin("4056489470459")).toEqual({ ok: false, reason: "BAD_CHECK_DIGIT" });
    expect(normalizeGtin(" ")).toEqual({ ok: false, reason: "MISSING" });
  });
  it("reads ISO and French dates, rejecting impossible ones", () => {
    expect(normalizeDate("10/12/2026")).toBe("2026-12-10");
    expect(normalizeDate("2026-12-10")).toBe("2026-12-10");
    expect(normalizeDate("31/02/2026")).toBeNull();
  });
});

describe("deterministic evaluation", () => {
  const lot = (gtinRaw: string | null, lotRaw: string | null, bestBeforeRaw: string | null = null) => ({ gtinRaw, lotRaw, bestBeforeRaw });

  it("matches a listed (GTIN, lot) pair, case-insensitively for this lowercased source", () => {
    const r = evaluateMatch(scope, lot(GTIN_A, "K101", "11/12/2026"));
    expect(r.status).toBe("RECORDED_MATCH");
    expect(r.reasons).toContain("DATE_CONFIRMED");
  });

  it("excludes a lot that is listed only under the other GTIN", () => {
    const r = evaluateMatch(scope, lot(GTIN_B, "K101"));
    expect(r.status).toBe("NOT_MATCHING_THIS_NOTICE");
    expect(r.reasons).toEqual(["GTIN_IN_NOTICE", "LOT_NOT_LISTED", "LOT_LISTED_UNDER_OTHER_GTIN_ONLY"]);
  });

  it("excludes products whose GTIN is not in the notice", () => {
    expect(evaluateMatch(scope, lot("3256226396817", "K100")).status).toBe("NOT_MATCHING_THIS_NOTICE");
  });

  it("needs evidence when the lot is missing, and never guesses", () => {
    const r = evaluateMatch(scope, lot(GTIN_A, null));
    expect(r.status).toBe("NEEDS_EVIDENCE");
    expect(r.missingFields).toEqual(["lot", "best_before"]);
  });

  it("does not equate O with 0 in lot codes", () => {
    expect(evaluateMatch(scope, lot(GTIN_A, "K1OO")).status).toBe("NOT_MATCHING_THIS_NOTICE");
  });

  it("needs evidence for an invalid or missing GTIN", () => {
    expect(evaluateMatch(scope, lot("4056489470459", "K100")).reasons).toEqual(["GTIN_INVALID"]);
    expect(evaluateMatch(scope, lot(null, "K100")).reasons).toEqual(["GTIN_MISSING"]);
  });

  it("flags a best-before date that contradicts the listed entry", () => {
    const r = evaluateMatch(scope, lot(GTIN_A, "K100", "11/12/2026"));
    expect(r.status).toBe("NEEDS_EVIDENCE");
    expect(r.reasons).toContain("DATE_CONFLICT");
  });

  it("resolves a missing lot from confirmed label evidence", () => {
    const evidence: ConfirmedEvidence = [
      { field: "lot", value: "K100", evidenceId: "e1" },
      { field: "best_before", value: "10/12/2026", evidenceId: "e2" },
    ];
    const r = evaluateMatch(scope, lot(GTIN_A, null), evidence);
    expect(r.status).toBe("RECORDED_MATCH");
    expect(r.effective.lot).toEqual({ value: "K100", source: "evidence" });
  });

  it("resolves to not matching when the label shows an unlisted lot", () => {
    const r = evaluateMatch(scope, lot(GTIN_A, null), [{ field: "lot", value: "K102", evidenceId: "e1" }]);
    expect(r.status).toBe("NOT_MATCHING_THIS_NOTICE");
  });

  it("reopens review when later evidence contradicts earlier evidence", () => {
    const evidence: ConfirmedEvidence = [
      { field: "lot", value: "K102", evidenceId: "e1" },
      { field: "lot", value: "K100", evidenceId: "e2" },
    ];
    const r = evaluateMatch(scope, lot(GTIN_A, null), evidence);
    expect(r.status).toBe("NEEDS_EVIDENCE");
    expect(r.reasons).toContain("LOT_CONFLICT");
  });

  it("reopens review when label evidence contradicts the register", () => {
    const r = evaluateMatch(scope, lot(GTIN_A, "K102"), [{ field: "lot", value: "K100", evidenceId: "e1" }]);
    expect(r.reasons).toContain("LOT_CONFLICT");
  });
});
