// Plain-language wording shared by the overview and the case page.
// Rules: never call anything "safe"; a recorded delivery does not prove stock is on site;
// a staff report is not independent proof; AI readings are unconfirmed until a person confirms them.
import type { MatchStatus, ResponseStatus } from "@/lib/cases";
import { REASON_TEXT, type ReasonCode } from "@/lib/matching/evaluate";

export type Tone = "attention" | "evidence" | "neutral" | "complete" | "waiting";

/** One-sentence verdict for a kitchen's delivery. */
export function verdict(match: MatchStatus, reasons: ReasonCode[], opts: { viaLabel?: boolean } = {}): string {
  if (match === "RECORDED_MATCH") {
    if (reasons.includes("ALL_LOTS_FOR_GTIN")) return "Received this product, and the notice recalls every lot of it.";
    return opts.viaLabel
      ? "Received a batch listed in this recall (confirmed from the label photo)."
      : "Received a batch listed in this recall.";
  }
  if (match === "NEEDS_EVIDENCE") {
    if (reasons.includes("LOT_MISSING")) return "Received this product, but the lot code wasn't recorded, so we can't tell yet if it is a recalled batch.";
    if (reasons.includes("LOT_CONFLICT") || reasons.includes("GTIN_CONFLICT")) return "The recorded and confirmed values disagree, so a person needs to check the label again.";
    if (reasons.includes("UNSUPPORTED_NOTICE_CRITERIA")) return "The notice uses criteria this prototype cannot check automatically; a person must review it.";
    return "More evidence is needed before we can tell whether this is a recalled batch.";
  }
  if (reasons.includes("GTIN_NOT_IN_NOTICE")) return "This delivery's barcode is not listed in this notice.";
  return "Received this product, but not one of the batches listed in this notice.";
}

/** Reasons worth showing (drops the obvious "GTIN is listed" line). */
export function whyLines(reasons: ReasonCode[]): string[] {
  return reasons.filter((r) => r !== "GTIN_IN_NOTICE").map((r) => REASON_TEXT[r]);
}

/** Short "next step" hint used on overview cards. */
export function nextStepHint(match: MatchStatus, response: ResponseStatus): { text: string; tone: Tone } {
  if (response === "REVIEWED_COMPLETE") return { text: "Done: reviewed complete.", tone: "complete" };
  if (match === "NOT_MATCHING_THIS_NOTICE") return { text: "No action required by this notice.", tone: "neutral" };
  if (match === "NEEDS_EVIDENCE") return { text: "Get a label photo from the kitchen.", tone: "evidence" };
  if (response === "STAFF_REPORTED_ACTION") return { text: "Read the kitchen's report and mark it reviewed.", tone: "attention" };
  if (response === "REQUESTED") return { text: "Waiting for the kitchen's stock-check report.", tone: "waiting" };
  if (response === "ESCALATED") return { text: "Escalated: follow up with the kitchen directly.", tone: "attention" };
  return { text: "Ask the kitchen to check its stock.", tone: "attention" };
}

export const needsAttention = (match: MatchStatus, response: ResponseStatus) =>
  match !== "NOT_MATCHING_THIS_NOTICE" && response !== "REVIEWED_COMPLETE";

export const STAFF_ACTION_TEXT: Record<string, string> = {
  SET_ASIDE: "Set aside affected stock according to the notice",
  NONE_FOUND: "Checked: none of this product/lot found in stock",
  COULD_NOT_CHECK: "Could not check",
};
