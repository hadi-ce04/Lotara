import { CircleAlert, CircleHelp, CircleMinus, ClipboardCheck, Clock, PhoneOutgoing, ShieldAlert, UserCheck } from "lucide-react";
import type { MatchStatus, ResponseStatus } from "@/lib/cases";

// Text and icons carry meaning; colour only reinforces it. Success styling is
// reserved for the completed administrative state ("Reviewed complete").

export const MATCH = {
  RECORDED_MATCH: {
    label: "Recorded match",
    Icon: CircleAlert,
    cls: "bg-red-50 text-red-800 ring-red-200",
    accent: "border-l-red-500",
    iconCls: "text-red-700",
  },
  NEEDS_EVIDENCE: {
    label: "Needs evidence",
    Icon: CircleHelp,
    cls: "bg-amber-50 text-amber-900 ring-amber-300",
    accent: "border-l-amber-400",
    iconCls: "text-amber-700",
  },
  NOT_MATCHING_THIS_NOTICE: {
    label: "Not matching this notice",
    Icon: CircleMinus,
    cls: "bg-slate-100 text-slate-700 ring-slate-300",
    accent: "border-l-slate-300",
    iconCls: "text-slate-500",
  },
} as const;

export const RESPONSE = {
  NOT_REQUESTED: { label: "Not requested", Icon: Clock, cls: "bg-white text-slate-600 ring-slate-200" },
  REQUESTED: { label: "Staff check requested", Icon: PhoneOutgoing, cls: "bg-sky-50 text-sky-900 ring-sky-200" },
  STAFF_REPORTED_ACTION: { label: "Staff reported action", Icon: UserCheck, cls: "bg-indigo-50 text-indigo-900 ring-indigo-200" },
  REVIEWED_COMPLETE: { label: "Reviewed complete", Icon: ClipboardCheck, cls: "bg-emerald-50 text-emerald-900 ring-emerald-300" },
  ESCALATED: { label: "Escalated", Icon: ShieldAlert, cls: "bg-orange-50 text-orange-900 ring-orange-200" },
} as const;

type Size = "sm" | "md";
const SIZE: Record<Size, { box: string; icon: string }> = {
  sm: { box: "gap-1 px-2 py-0.5 text-xs", icon: "size-3.5" },
  md: { box: "gap-1.5 px-2.5 py-1 text-sm", icon: "size-4" },
};

function Badge({ label, Icon, cls, size = "sm" }: { label: string; Icon: typeof Clock; cls: string; size?: Size }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full font-medium ring-1 ${SIZE[size].box} ${cls}`}>
      <Icon className={SIZE[size].icon} aria-hidden /> {label}
    </span>
  );
}

export const MatchBadge = ({ status, size }: { status: MatchStatus; size?: Size }) => <Badge {...MATCH[status]} size={size} />;
export const ResponseBadge = ({ status, size }: { status: ResponseStatus; size?: Size }) => <Badge {...RESPONSE[status]} size={size} />;
export const matchLabel = (s: MatchStatus) => MATCH[s].label;
export const responseLabel = (s: ResponseStatus) => RESPONSE[s].label;
