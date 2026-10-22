import type { ArmResult, InvestigationResult } from "./results";
import type { EvidenceField, MatchStatus, ReasonCode } from "../matching/evaluate";

export type EvalResults = {
  generatedAt: string;
  notice: { sourceId: string; sourceVersion: number; retrievedAt: string; entries: string[] };
  model: { id: string; effort: string; promptVersion: string };
  fixture: { total: number; dev: number; holdout: number; uniqueCases: number; devUnique: number; holdoutUnique: number; duplicateCopies: number };
  dbSeedConsistency: { checked: number; mismatches: { id: string; db: string; structured: MatchStatus }[] } | null;
  arms: {
    nameBaseline: ArmResult;
    structured: ArmResult & { details: Record<string, { status: MatchStatus; reasons: ReasonCode[]; missingFields: EvidenceField[] }> };
    investigation: InvestigationResult | null;
  };
};
