// Canonical, reviewed recall scope used by the deterministic evaluator.

export type ScopeEntry = {
  gtin14: string;
  gtinRaw: string;
  /** null only when the notice explicitly covers all lots for this GTIN. */
  lot: string | null;
  allLots: boolean;
  dateType: "best_before" | "use_by" | null;
  date: string | null;
};

export type RecallScope = {
  brand: string;
  productTitle: string;
  references: string[];
  entries: ScopeEntry[];
  /** True when the source lowercases lot codes, so exact case cannot be compared. */
  lotCaseInsensitive: boolean;
  /** Notice terms this prototype does not evaluate; any present forces review. */
  unsupportedCriteria: string[];
};
