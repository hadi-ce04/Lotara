import type { ReactNode } from "react";
import type { ReasonCode } from "@/lib/matching/evaluate";
import type { ScopeEntry } from "@/lib/recalls/scope";
import { fmtIsoDay } from "./format";
import { NotRecorded } from "./ui";

type Mark = { kind: "same" | "differs" | "missing" | "conflict" | "not-needed"; text: string };

const MARK_STYLE: Record<Mark["kind"], { cls: string; sign: string }> = {
  same: { cls: "bg-tomato-soft text-tomato ring-tomato/40", sign: "=" },
  differs: { cls: "bg-paper text-ink ring-rule-strong", sign: "≠" },
  missing: { cls: "bg-ochre-soft text-ochre ring-ochre/40", sign: "?" },
  conflict: { cls: "bg-tomato-soft text-tomato ring-tomato/40", sign: "!" },
  "not-needed": { cls: "bg-card text-muted ring-rule", sign: "·" },
};

function MarkChip({ mark }: { mark: Mark }) {
  const { cls, sign } = MARK_STYLE[mark.kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      <span aria-hidden className="font-mono font-semibold">{sign}</span> {mark.text}
    </span>
  );
}

type Props = {
  entries: ScopeEntry[];
  caseGtin14: string | null;
  matchedEntry: ScopeEntry | null;
  reasons: ReasonCode[];
  delivery: { gtin: string | null; lot: string | null; bestBefore: string | null };
  label: { gtin: string | null; lot: string | null; bestBefore: string | null } | null;
};

/** "Recall says, Your delivery says, Confirmed label says": one row per identifier. */
export function Comparison({ entries, caseGtin14, matchedEntry, reasons, delivery, label }: Props) {
  const has = (r: ReasonCode) => reasons.includes(r);
  const forGtin = entries.filter((e) => e.gtin14 === caseGtin14);
  const lotOf = (e: ScopeEntry) => (e.allLots || !e.lot ? "All lots" : e.lot.toUpperCase());

  const gtinMark: Mark = has("GTIN_CONFLICT") ? { kind: "conflict", text: "Values disagree" }
    : has("GTIN_IN_NOTICE") ? { kind: "same", text: "In the notice" }
    : has("GTIN_NOT_IN_NOTICE") ? { kind: "differs", text: "Not in the notice" }
    : has("GTIN_INVALID") ? { kind: "missing", text: "Invalid barcode" }
    : { kind: "missing", text: "Missing" };

  const lotMark: Mark = has("LOT_CONFLICT") ? { kind: "conflict", text: "Values disagree" }
    : has("LOT_LISTED") ? { kind: "same", text: "Recalled lot" }
    : has("ALL_LOTS_FOR_GTIN") ? { kind: "same", text: "All lots recalled" }
    : has("LOT_LISTED_UNDER_OTHER_GTIN_ONLY") ? { kind: "differs", text: "Only recalled under another barcode" }
    : has("LOT_NOT_LISTED") ? { kind: "differs", text: "Not a recalled lot" }
    : has("LOT_MISSING") ? { kind: "missing", text: "Missing: needed to decide" }
    : { kind: "not-needed", text: "Not checked" };

  const dateMark: Mark = has("DATE_CONFLICT") ? { kind: "conflict", text: "Date disagrees" }
    : has("DATE_CONFIRMED") ? { kind: "same", text: "Same date" }
    : has("DATE_UNREADABLE") ? { kind: "missing", text: "Unreadable" }
    : has("DATE_NOT_RECORDED") ? { kind: "not-needed", text: "Not needed: barcode + lot suffice" }
    : { kind: "not-needed", text: "Not checked" };

  const recallGtin: ReactNode = forGtin.length > 0
    ? <span className="font-mono">{forGtin[0].gtinRaw}</span>
    : <span className="text-muted">{[...new Set(entries.map((e) => e.gtinRaw))].join(", ")}</span>;
  const recallLot: ReactNode = matchedEntry
    ? <span className="font-mono">{lotOf(matchedEntry)}</span>
    : forGtin.length > 0
      ? <span className="font-mono">{forGtin.map(lotOf).join(" or ")}</span>
      : <span className="text-muted">·</span>;
  const recallDate: ReactNode = matchedEntry
    ? <span className="font-mono">{fmtIsoDay(matchedEntry.date) ?? "·"}</span>
    : forGtin.length > 0
      ? <span className="space-y-0.5">{forGtin.map((e, i) => <span key={i} className="block"><span className="font-mono">{fmtIsoDay(e.date) ?? "·"}</span> <span className="text-xs text-muted">(lot {lotOf(e)})</span></span>)}</span>
      : <span className="text-muted">·</span>;

  const cell = (v: string | null, missing: ReactNode = <NotRecorded />) => (v ? <span className="font-mono">{v}</span> : missing);
  const labelCell = (v: string | null | undefined) => (label ? (v ? <span className="font-mono font-semibold">{v}</span> : <span className="text-muted">·</span>) : <span className="text-xs text-muted">no confirmed label yet</span>);

  const rows: [string, ReactNode, ReactNode, ReactNode, Mark][] = [
    ["Barcode (GTIN)", recallGtin, cell(delivery.gtin), labelCell(label?.gtin), gtinMark],
    ["Lot code", recallLot, cell(delivery.lot), labelCell(label?.lot), lotMark],
    ["Best before", recallDate, cell(delivery.bestBefore, <span className="text-muted">not recorded</span>), labelCell(label?.bestBefore), dateMark],
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="w-28 py-2 pr-3 font-medium"><span className="sr-only">Identifier</span></th>
            <th scope="col" className="py-2 pr-3 font-medium">Recall says</th>
            <th scope="col" className="py-2 pr-3 font-medium">Your delivery record says</th>
            <th scope="col" className="py-2 pr-3 font-medium">Confirmed label says</th>
            <th scope="col" className="py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule align-top">
          {rows.map(([name, recall, del, lab, mark]) => (
            <tr key={name}>
              <th scope="row" className="py-3 pr-3 font-medium text-ink">{name}</th>
              <td className="py-3 pr-3">{recall}</td>
              <td className="py-3 pr-3">{del}</td>
              <td className="py-3 pr-3">{lab}</td>
              <td className="py-3"><MarkChip mark={mark} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
