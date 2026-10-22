import { Check, Minus } from "lucide-react";
import type { MatchStatus, ResponseStatus } from "@/lib/cases";

type StepState = "done" | "current" | "todo" | "skipped";
type Step = { label: string; state: StepState; note: string };

export type ProgressInput = {
  match: MatchStatus;
  response: ResponseStatus;
  /** Case page only: more precise notes for the evidence step. */
  evidence?: { requestOpen: boolean; photoWaitingForConfirmation: boolean; usedConfirmedLabel: boolean };
};

/** The four stages every case goes through, derived from match + response status. */
export function caseSteps({ match, response, evidence }: ProgressInput): Step[] {
  const notMatching = match === "NOT_MATCHING_THIS_NOTICE";
  const checked: Step = { label: "Checked against recall", state: "done", note: notMatching ? "Batch not listed" : "Barcode is in the notice" };

  let ev: Step;
  if (notMatching) ev = { label: "Evidence", state: "skipped", note: "Not needed" };
  else if (match === "NEEDS_EVIDENCE") {
    ev = {
      label: "Evidence",
      state: "current",
      note: evidence?.photoWaitingForConfirmation
        ? "Photo to confirm"
        : evidence?.requestOpen
          ? "Waiting for label photo"
          : "Lot code missing",
    };
  } else ev = { label: "Evidence", state: "done", note: evidence?.usedConfirmedLabel ? "Label confirmed" : "Batch identified" };

  let kitchen: Step;
  if (notMatching) kitchen = { label: "Kitchen stock check", state: "skipped", note: "Not needed" };
  else if (response === "STAFF_REPORTED_ACTION" || response === "REVIEWED_COMPLETE") kitchen = { label: "Kitchen stock check", state: "done", note: "Kitchen reported" };
  else if (response === "REQUESTED") kitchen = { label: "Kitchen stock check", state: "current", note: "Waiting for kitchen" };
  else if (response === "ESCALATED") kitchen = { label: "Kitchen stock check", state: "current", note: "Escalated" };
  else kitchen = { label: "Kitchen stock check", state: match === "RECORDED_MATCH" ? "current" : "todo", note: "Not requested yet" };

  let review: Step;
  if (notMatching) review = { label: "Manager review", state: "skipped", note: "Not needed" };
  else if (response === "REVIEWED_COMPLETE") review = { label: "Manager review", state: "done", note: "Reviewed complete" };
  else if (response === "STAFF_REPORTED_ACTION" && match !== "NEEDS_EVIDENCE") review = { label: "Manager review", state: "current", note: "Ready for your review" };
  else review = { label: "Manager review", state: "todo", note: "After kitchen report" };

  return [checked, ev, kitchen, review];
}

const DOT: Record<StepState, string> = {
  done: "bg-slate-800 text-white ring-1 ring-slate-800",
  current: "bg-white text-sky-800 ring-2 ring-sky-600",
  todo: "bg-white text-slate-400 ring-1 ring-slate-300",
  skipped: "border border-dashed border-slate-300 bg-white text-slate-400",
};
const STATE_TEXT: Record<StepState, string> = { done: "done", current: "in progress", todo: "not started", skipped: "not needed" };

/** Horizontal 4-step tracker. `compact` is used inside overview cards. */
export function CaseProgress({ compact = false, ...input }: ProgressInput & { compact?: boolean }) {
  const steps = caseSteps(input);
  const complete = input.response === "REVIEWED_COMPLETE";
  return (
    <ol className={`grid grid-cols-4 ${compact ? "gap-1" : "gap-2"}`} aria-label="Case progress">
      {steps.map((s, i) => {
        const finalDone = complete && i === steps.length - 1;
        return (
          <li key={s.label} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute right-1/2 ${compact ? "top-3" : "top-4"} h-0.5 w-full ${steps[i - 1].state === "done" && s.state !== "todo" ? "bg-slate-700" : "bg-slate-200"}`}
              />
            )}
            <span
              className={`relative z-10 flex items-center justify-center rounded-full ${compact ? "size-6 text-xs" : "size-8 text-sm"} font-semibold ${finalDone ? "bg-emerald-600 text-white ring-1 ring-emerald-600" : DOT[s.state]}`}
            >
              {s.state === "done" ? <Check className={compact ? "size-3.5" : "size-4"} aria-hidden /> : s.state === "skipped" ? <Minus className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={`mt-1.5 font-medium leading-tight ${compact ? "text-[11px]" : "text-sm"} ${s.state === "skipped" || s.state === "todo" ? "text-slate-500" : "text-slate-900"}`}>
              {s.label}
            </span>
            <span className={`leading-tight ${compact ? "text-[11px]" : "text-xs"} ${s.state === "current" ? "font-medium text-sky-800" : "text-slate-500"}`}>
              {(!compact || s.state === "current") && s.note}
              <span className="sr-only"> ({STATE_TEXT[s.state]})</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
