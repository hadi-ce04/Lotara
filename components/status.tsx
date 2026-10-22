import { CircleAlert, CircleHelp, CircleMinus, ClipboardCheck, Clock, PhoneOutgoing, ShieldAlert, UserCheck } from "lucide-react";
import type { MatchStatus, ResponseStatus } from "@/lib/cases";

// Text and icons carry meaning; colour only reinforces it. Success styling is
// reserved for the completed administrative state.

const MATCH = {
  RECORDED_MATCH: { label: "Recorded match", Icon: CircleAlert, cls: "bg-red-50 text-red-800 ring-red-200" },
  NEEDS_EVIDENCE: { label: "Needs evidence", Icon: CircleHelp, cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  NOT_MATCHING_THIS_NOTICE: { label: "Not matching this notice", Icon: CircleMinus, cls: "bg-slate-100 text-slate-700 ring-slate-200" },
} as const;

const RESPONSE = {
  NOT_REQUESTED: { label: "Not requested", Icon: Clock, cls: "bg-white text-slate-600 ring-slate-200" },
  REQUESTED: { label: "Staff check requested", Icon: PhoneOutgoing, cls: "bg-sky-50 text-sky-900 ring-sky-200" },
  STAFF_REPORTED_ACTION: { label: "Staff reported action", Icon: UserCheck, cls: "bg-indigo-50 text-indigo-900 ring-indigo-200" },
  REVIEWED_COMPLETE: { label: "Reviewed complete", Icon: ClipboardCheck, cls: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  ESCALATED: { label: "Escalated", Icon: ShieldAlert, cls: "bg-orange-50 text-orange-900 ring-orange-200" },
} as const;

function Badge({ label, Icon, cls }: { label: string; Icon: typeof Clock; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      <Icon className="size-3.5" aria-hidden /> {label}
    </span>
  );
}

export const MatchBadge = ({ status }: { status: MatchStatus }) => <Badge {...MATCH[status]} />;
export const ResponseBadge = ({ status }: { status: ResponseStatus }) => <Badge {...RESPONSE[status]} />;
export const matchLabel = (s: MatchStatus) => MATCH[s].label;
