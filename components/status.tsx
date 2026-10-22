import type { MatchStatus, ResponseStatus } from "@/lib/cases";

// Text carries meaning; colour only reinforces it. Status tags read like a stamp on a
// printed notice: a bold uppercase code word, then the plain label. Success styling is
// reserved for the completed administrative state ("Reviewed complete").

export const MATCH = {
  RECORDED_MATCH: { label: "Recorded match", code: "Match", cls: "bg-tomato-soft text-tomato border-tomato", accent: "border-t-tomato", iconCls: "text-tomato" },
  NEEDS_EVIDENCE: { label: "Needs evidence", code: "Check", cls: "bg-ochre-soft text-ochre border-ochre", accent: "border-t-ochre", iconCls: "text-ochre" },
  NOT_MATCHING_THIS_NOTICE: { label: "Not matching this notice", code: "Clear", cls: "bg-stone-soft text-stone border-stone", accent: "border-t-stone", iconCls: "text-stone" },
} as const;

export const RESPONSE = {
  NOT_REQUESTED: { label: "Not requested", code: "Idle", cls: "bg-card text-muted border-rule-strong" },
  REQUESTED: { label: "Staff check requested", code: "Sent", cls: "bg-harbour-soft text-harbour border-harbour" },
  STAFF_REPORTED_ACTION: { label: "Staff reported action", code: "Staff", cls: "bg-harbour-soft text-harbour border-harbour" },
  REVIEWED_COMPLETE: { label: "Reviewed complete", code: "Done", cls: "bg-sage-soft text-sage border-sage" },
  ESCALATED: { label: "Escalated", code: "Esc", cls: "bg-tomato-soft text-tomato border-tomato" },
} as const;

type Size = "sm" | "md";
const SIZE: Record<Size, string> = { sm: "text-xs", md: "text-sm" };

function Badge({ label, code, cls, size = "sm" }: { label: string; code: string; cls: string; size?: Size }) {
  return (
    <span className={`inline-flex items-stretch whitespace-nowrap rounded-[2px] border ${SIZE[size]} ${cls}`}>
      <span aria-hidden className="border-r border-current px-1.5 py-0.5 font-mono text-[0.7em] font-semibold uppercase tracking-[0.12em] leading-[1.9]">{code}</span>
      <span className="px-2 py-0.5 font-medium">{label}</span>
    </span>
  );
}

export const MatchBadge = ({ status, size }: { status: MatchStatus; size?: Size }) => <Badge {...MATCH[status]} size={size} />;
export const ResponseBadge = ({ status, size }: { status: ResponseStatus; size?: Size }) => <Badge {...RESPONSE[status]} size={size} />;
export const matchLabel = (s: MatchStatus) => MATCH[s].label;
export const responseLabel = (s: ResponseStatus) => RESPONSE[s].label;
