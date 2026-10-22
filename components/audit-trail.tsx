import { fmtDateTime } from "./format";
import { matchLabel } from "./status";

type Event = {
  id: string | number;
  event_type: string;
  occurred_at: string;
  actor_id: string;
  source: string;
  payload: { from?: string; to?: string; trigger?: string; fields?: string[]; status?: string } | null;
};

const TRIGGER: Record<string, string> = {
  label_confirmed: "after the label values were confirmed",
  evidence_confirmed: "after the label values were confirmed",
  investigation: "during the rule-based check",
  ai_investigation: "during the AI investigation",
  reset: "when the demo was loaded",
};

const label = (s: string | undefined) =>
  s === "RECORDED_MATCH" || s === "NEEDS_EVIDENCE" || s === "NOT_MATCHING_THIS_NOTICE" ? matchLabel(s) : (s ?? "?").replaceAll("_", " ").toLowerCase();

function describe(e: Event): string {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case "case.assessed":
      return "Delivery checked against the recall notice";
    case "case.reassessed":
      return `Status changed: ${label(p.from)} → ${label(p.to)}${p.trigger ? ` (${TRIGGER[p.trigger] ?? p.trigger.replaceAll("_", " ")})` : ""}`;
    case "evidence.requested":
      return e.source === "ai" ? "AI investigator requested a label photo from the kitchen" : "Label photo requested from the kitchen";
    case "evidence.uploaded":
      return e.source === "kitchen" ? "Kitchen uploaded a label photo" : "Manager uploaded a label photo";
    case "evidence.extracted":
      return "AI transcribed the label photo (unconfirmed)";
    case "evidence.extraction_failed":
      return "AI could not transcribe the label photo";
    case "evidence.confirmed":
      return "A person confirmed the label values";
    case "staff.check_requested":
      return "Kitchen asked to check its stock";
    case "staff.reported":
      return "Kitchen sent a stock-check report";
    case "investigation.finished":
      return e.source === "ai" ? "AI investigation finished" : "Rule-based check finished (no AI)";
    case "case.reviewed_complete":
      return "Manager marked the case reviewed complete";
    case "demo.reset":
      return "Demo data reset";
    default:
      return e.event_type;
  }
}

const actor = (id: string) => (id.startsWith("participant:") ? "kitchen staff (signed link)" : id);

export function AuditTrail({ events }: { events: Event[] }) {
  if (events.length === 0) return <p className="text-sm text-muted">No events yet.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="relative border-l-2 border-rule pl-4">
          <span aria-hidden className="absolute -left-[5px] top-1.5 size-2 rounded-sm bg-rule-strong" />
          <p className="text-sm text-ink">{describe(e)}</p>
          <p className="text-xs text-muted">
            {fmtDateTime(e.occurred_at)} · {actor(e.actor_id)} · <span className="font-mono">{e.event_type}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}
