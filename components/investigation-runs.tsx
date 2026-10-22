import { fmtTime } from "./format";
import { matchLabel } from "./status";

type Step = {
  step_index: number;
  tool_name: string;
  kind: "tool" | "model";
  status: string;
  elapsed_ms: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  usage: { input_tokens: number; output_tokens: number } | null;
};
export type Run = {
  id: string;
  method: string;
  status: string;
  trigger: string | null;
  model_id: string | null;
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  error_category: string | null;
  usage: { input_tokens: number; output_tokens: number } | null;
  cost_usd_est: string | null;
  steps: Step[];
};

const TOOL_TEXT: Record<string, string> = {
  get_recall_scope: "read the notice's batch list",
  get_delivery_record: "read the delivery record",
  get_case_evidence: "looked at photos and confirmed values",
  extract_label: "transcribed the label photo",
  evaluate_match: "ran the rule-based matcher",
  request_evidence: "asked the kitchen for a label photo",
  finish_investigation: "wrote its summary",
};

const RUN_STATUS: Record<string, string> = {
  RUNNING: "Running…",
  COMPLETED: "Finished",
  NEEDS_EVIDENCE: "Finished · evidence still needed",
  FAILED: "Stopped",
};

const TRIGGER: Record<string, string> = {
  manual: "started by the manager",
  evidence_uploaded: "started automatically after a photo upload",
  evidence_confirmed: "started automatically after values were confirmed",
};

const isStatus = (v: unknown): v is "RECORDED_MATCH" | "NEEDS_EVIDENCE" | "NOT_MATCHING_THIS_NOTICE" =>
  v === "RECORDED_MATCH" || v === "NEEDS_EVIDENCE" || v === "NOT_MATCHING_THIS_NOTICE";

function stepText(s: Step, ai: boolean): string {
  const o = s.output ?? {};
  if (s.kind === "model") {
    const calls = (o.tool_calls as string[] | undefined) ?? [];
    return calls.length ? `AI decided to: ${calls.map((c) => TOOL_TEXT[c] ?? c).join(", ")}` : "AI decided it was done";
  }
  const who = ai ? "Tool" : "Rule";
  if (s.status === "ERROR") return `${who} call rejected: ${String(o.error ?? o.error_category ?? "error").slice(0, 140)}`;
  switch (s.tool_name) {
    case "evaluate_match":
      return `Ran the rule-based matcher → ${isStatus(o.status) ? matchLabel(o.status) : String(o.status)}`;
    case "request_evidence":
      return o.created ? `Asked the kitchen for a label photo (${(o.fields as string[]).join(", ").replace("best_before", "best-before date").replace("lot", "lot code")})` : "Label photo request was already open";
    case "extract_label": {
      const f = (o.fields ?? {}) as Record<string, unknown>;
      return `Transcribed the label (unconfirmed): lot ${f.lot_text ?? "·"}, date ${f.best_before_text ?? "·"}`;
    }
    case "finish_investigation":
      return "Summary checked against the evidence and saved";
    default:
      return capitalizeFirst(TOOL_TEXT[s.tool_name] ?? "read data");
  }
}
const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Chip naming who did the investigation: "AI · model" or "Rule-based (no AI)". */
export function MethodChip({ run }: { run: Pick<Run, "method" | "model_id"> }) {
  const ai = run.method.startsWith("ai");
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium ring-1 ${ai ? "bg-forest-soft text-forest ring-forest/40" : "bg-paper text-ink ring-rule"}`}>
      <span className="font-mono">{ai ? `AI · ${run.model_id ?? "model"}` : "Rule-based (no AI)"}</span>
    </span>
  );
}

export function runTotals(runs: Run[]) {
  let steps = 0, tokens = 0, cost = 0;
  for (const r of runs) {
    steps += r.steps.length;
    if (r.usage) tokens += r.usage.input_tokens + r.usage.output_tokens;
    if (r.cost_usd_est) cost += Number(r.cost_usd_est);
  }
  return { steps, tokens, cost };
}

export function InvestigationRuns({ runs }: { runs: Run[] }) {
  if (runs.length === 0) return <p className="text-sm text-muted">No investigation has run on this case yet.</p>;
  return (
    <ol className="space-y-4">
      {runs.map((r) => {
        const ai = r.method.startsWith("ai");
        return (
          <li key={r.id} className="rounded-sm border border-rule p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <MethodChip run={r} />
              <span className="font-medium">{RUN_STATUS[r.status] ?? r.status.replaceAll("_", " ").toLowerCase()}</span>
              <span className="text-xs text-muted">
                {fmtTime(r.started_at)}{r.trigger ? ` · ${TRIGGER[r.trigger] ?? r.trigger.replaceAll("_", " ")}` : ""}
              </span>
            </div>
            {(r.usage || r.cost_usd_est) && (
              <p className="mt-1 text-xs text-muted">
                {r.usage ? `${r.usage.input_tokens.toLocaleString("en")} tokens in · ${r.usage.output_tokens.toLocaleString("en")} out` : ""}
                {r.cost_usd_est ? ` · ≈$${Number(r.cost_usd_est).toFixed(3)} estimated cost` : ""}
              </p>
            )}
            {r.error_category && <p className="mt-1 text-xs text-tomato">Stopped: {r.error_category.replaceAll("_", " ")}. Steps so far are saved.</p>}
            {r.summary && <p className="mt-3 rounded-md bg-paper p-3 text-sm leading-relaxed text-ink">{r.summary}</p>}
            <ol className="mt-3 space-y-1.5 border-l-2 border-rule pl-3 text-xs text-ink">
              {r.steps.map((s) => (
                <li key={s.step_index} className="flex gap-2">
                  <span aria-hidden className="w-9 shrink-0 font-mono text-[10px] font-semibold uppercase text-muted">{s.kind === "model" ? "AI" : "Tool"}</span>
                  <span>
                    <span className={s.status === "ERROR" ? "text-tomato" : ""}>{stepText(s, ai)}</span>
                    <span className="text-muted">
                      {" "}· <span className="font-mono">{s.kind === "model" ? "model" : s.tool_name}</span> · {s.elapsed_ms} ms
                      {s.usage ? ` · ${s.usage.input_tokens}→${s.usage.output_tokens} tokens` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
