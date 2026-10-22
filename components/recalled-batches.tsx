import type { ScopeEntry } from "@/lib/recalls/scope";
import { fmtIsoDay } from "./format";

/** The notice's exact batches, grouped by barcode, in a form a person can scan. */
export function RecalledBatches({ entries, highlightGtin14 }: { entries: ScopeEntry[]; highlightGtin14?: string | null }) {
  const groups = new Map<string, { gtinRaw: string; gtin14: string; items: ScopeEntry[] }>();
  for (const e of entries) {
    const g = groups.get(e.gtin14) ?? { gtinRaw: e.gtinRaw, gtin14: e.gtin14, items: [] };
    g.items.push(e);
    groups.set(e.gtin14, g);
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {[...groups.values()].map((g) => {
        const mine = highlightGtin14 === g.gtin14;
        return (
          <li key={g.gtin14} className={`rounded-sm p-3 ring-1 ${mine ? "bg-harbour-soft ring-harbour/40" : "bg-paper ring-rule"}`}>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              Barcode (GTIN) <span className="font-mono text-sm text-ink">{g.gtinRaw}</span>
              {mine && <span className="rounded bg-harbour-soft px-1.5 text-[11px] font-medium text-harbour">this delivery&apos;s barcode</span>}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {g.items.map((e, i) => (
                <li key={i} className="rounded-md bg-card px-2 py-1 text-xs ring-1 ring-rule">
                  {e.allLots || !e.lot ? <span className="font-medium">All lots</span> : <>Lot <span className="font-mono font-semibold">{e.lot.toUpperCase()}</span></>}
                  {e.date && <span className="text-muted"> · {e.dateType === "use_by" ? "use by" : "best before"} {fmtIsoDay(e.date)}</span>}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
