import { describe, expect, it } from "vitest";
import { nameBaseline, noticeScope, structuredArm } from "../lib/eval/arms";
import { loadCases, loadGold } from "../lib/eval/data";
import { duplicateReport, statusMetrics, toScored } from "../lib/eval/metrics";

// Deterministic arms only: no database, no API.
const { cases } = loadCases();
const gold = loadGold();
const scope = noticeScope();

describe("evaluation fixtures", () => {
  it("has ~12 dev / ~18 holdout rows, gold for every case, duplicates pointing at real cases", () => {
    expect(cases.filter((c) => c.split === "dev")).toHaveLength(12);
    expect(cases.filter((c) => c.split === "holdout")).toHaveLength(18);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(gold.has(c.id), c.id).toBe(true);
      if (c.duplicateOf) expect(cases.some((o) => o.id === c.duplicateOf)).toBe(true);
      if (gold.get(c.id)!.expectedAfter) expect(c.label, c.id).not.toBeNull();
    }
  });
});

describe("structured arm (register only)", () => {
  const rows = toScored(cases, (c) => structuredArm(scope, c).status);

  it("matches the gold register-only expectation on every row", () => {
    for (const c of cases) expect(structuredArm(scope, c).status, c.id).toBe(gold.get(c.id)!.expectedBefore);
  });

  it("never declares a non-affected case a recorded match, and excludes only the register-error trap", () => {
    const m = statusMetrics(rows, gold, "before");
    expect(m.recordedMatchPrecision.n).toBe(m.recordedMatchPrecision.d);
    expect(m.incorrectExclusionRate.n).toBe(1); // H04: register lot differs from the physical label
    expect(m.triageRecall.n + m.incorrectExclusionRate.n).toBe(m.affected);
  });

  it("treats lot case and whitespace leniently but never substitutes O for 0", () => {
    expect(structuredArm(scope, cases.find((c) => c.id === "D03")!).status).toBe("RECORDED_MATCH");
    expect(structuredArm(scope, cases.find((c) => c.id === "H03")!).status).toBe("RECORDED_MATCH");
    expect(structuredArm(scope, cases.find((c) => c.id === "H13")!).status).toBe("NOT_MATCHING_THIS_NOTICE");
  });

  it("gives duplicate copies the same status but does not detect them", () => {
    const d = duplicateReport(rows);
    expect(d.copies).toBe(2);
    expect(d.sameStatusAsOriginal.n).toBe(2);
    expect(d.detectedAsDuplicate.n).toBe(0);
  });
});

describe("product-name baseline", () => {
  const rows = toScored(cases, (c) => nameBaseline(scope, c));

  it("has no uncertainty state and alerts on same-brand or similar-name products", () => {
    expect(rows.some((r) => r.status === "NEEDS_EVIDENCE")).toBe(false);
    expect(nameBaseline(scope, cases.find((c) => c.id === "H05")!)).toBe("RECORDED_MATCH");
    expect(nameBaseline(scope, cases.find((c) => c.id === "H06")!)).toBe("RECORDED_MATCH");
    expect(nameBaseline(scope, cases.find((c) => c.id === "D04")!)).toBe("NOT_MATCHING_THIS_NOTICE");
  });

  it("has lower recorded-match precision than the structured arm", () => {
    const name = statusMetrics(rows, gold, "before");
    const structured = statusMetrics(toScored(cases, (c) => structuredArm(scope, c).status), gold, "before");
    expect(name.recordedMatchPrecision.pct!).toBeLessThan(structured.recordedMatchPrecision.pct!);
    expect(name.triageRecall.n).toBe(name.affected);
  });
});
