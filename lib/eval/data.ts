import { readFileSync } from "node:fs";
import path from "node:path";
import type { MatchStatus } from "../matching/evaluate";

// Evaluation fixtures. Cases (register data + the physical label truth used only by
// the harness) and gold labels are separate files; gold is loaded only for scoring.

export type Split = "dev" | "holdout";

export type LabelTruth = { gtin: string; lot: string; bestBefore: string };

export type EvalCase = {
  id: string;
  split: Split;
  ref: string;
  site: string;
  productName: string;
  gtin: string | null;
  lot: string | null;
  bestBefore: string | null;
  receivedAt: string;
  /** Values printed on the physical label; null when identical to the register / not needed. */
  label: LabelTruth | null;
  /** Set on a second register copy of the same delivery. */
  duplicateOf?: string;
};

export type EvalSite = { id: string; name: string; city: string; contactName: string };

export type GoldLabel = {
  id: string;
  affected: boolean;
  expectedBefore: MatchStatus;
  expectedAfter: MatchStatus | null;
  evidenceSufficient: boolean | null;
  category: string;
  rationale: string;
};

const FIXTURES = path.join(process.cwd(), "fixtures", "evaluation");

export function loadCases(): { sites: EvalSite[]; cases: EvalCase[] } {
  const raw = JSON.parse(readFileSync(path.join(FIXTURES, "cases.json"), "utf8"));
  return { sites: raw.sites, cases: raw.cases };
}

/** Gold labels. Call only after all arms have produced their outputs. */
export function loadGold(): Map<string, GoldLabel> {
  const raw = JSON.parse(readFileSync(path.join(FIXTURES, "gold.json"), "utf8"));
  return new Map((raw.labels as GoldLabel[]).map((g) => [g.id, g]));
}
