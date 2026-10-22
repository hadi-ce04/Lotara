import { Bot, Cog, Wrench } from "lucide-react";

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
type Run = {
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

const fmtTime = (d: string) => new Date(d).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" });

function stepDetail(s: Step): string {
  const o = s.output ?? {};
  if (s.kind === "model") {
    const calls = (o.tool_calls as string[] | undefined) ?? [];
    return `${calls.length ? `chose ${calls.join(", ")}` : `stop: ${o.stop_reason}`}${s.usage ? ` · ${s.usage.input_tokens}→${s.usage.output_tokens} tokens` : ""}`;
  }
  if (s.status === "ERROR") return `rejected: ${String(o.error ?? o.error_category ?? "error").slice(0, 140)}`;
  switch (s.tool_name) {
    case "evaluate_match":
      return `deterministic result: ${o.status}`;
    case "request_evidence":
      return o.created ? `requested ${(o.fields as string[]).join(", ")}` : "request already open";
    case "extract_label": {
      const f = (o.fields ?? {}) as Record<string, unknown>;
      return `unconfirmed transcription: lot ${f.lot_text ?? "—"}, date ${f.best_before_text ?? "—"}`;
    }
    case "finish_investigation":
      return "cited summary accepted";
    default:
      return "read";
  }
}

export function InvestigationRuns({ runs }: { runs: Run[] }) {
  if (runs.length === 0) return <p className="mt-3 text-sm text-slate-600">No investigation has run on this case yet.</p>;
  return (
    <div className="mt-4 space-y-3">
      {runs.map((r) => {
        const ai = r.method.startsWith("ai");
        return (
          <div key={r.id} className="rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ai ? "bg-violet-50 text-violet-900 ring-violet-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                {ai ? <Bot className="size-3.5" aria-hidden /> : <Cog className="size-3.5" aria-hidden />}
                {ai ? `AI · ${r.model_id ?? "model"}` : "Rule-based (no AI)"}
              </span>
              <span className="font-medium">{r.status === "RUNNING" ? "Running…" : r.status.replaceAll("_", " ").toLowerCase()}</span>
              <span className="text-xs text-slate-500">
                {fmtTime(r.started_at)}{r.trigger ? ` · trigger: ${r.trigger.replaceAll("_", " ")}` : ""}
                {r.usage ? ` · ${r.usage.input_tokens.toLocaleString()} in / ${r.usage.output_tokens.toLocaleString()} out tokens` : ""}
                {r.cost_usd_est ? ` · ≈$${Number(r.cost_usd_est).toFixed(3)} est.` : ""}
              </span>
            </div>
            {r.error_category && <p className="mt-1 text-xs text-red-700">Stopped: {r.error_category.replaceAll("_", " ")}. Steps so far are saved.</p>}
            <ol className="mt-2 space-y-0.5 text-xs text-slate-700">
              {r.steps.map((s) => (
                <li key={s.step_index} className="flex gap-2">
                  {s.kind === "model" ? <Bot className="mt-0.5 size-3 shrink-0 text-violet-700" aria-hidden /> : <Wrench className="mt-0.5 size-3 shrink-0 text-slate-500" aria-hidden />}
                  <span>
                    <span className="font-mono">{s.kind === "model" ? "model" : s.tool_name}</span>
                    <span className="text-slate-500"> · {s.elapsed_ms} ms · </span>
                    {stepDetail(s)}
                  </span>
                </li>
              ))}
            </ol>
            {r.summary && <p className="mt-2 rounded bg-slate-50 p-2 text-xs leading-relaxed">{r.summary}</p>}
          </div>
        );
      })}
    </div>
  );
}
