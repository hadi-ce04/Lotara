"use client";

import { useState } from "react";
import { evaluateMatch, REASON_TEXT, type MatchStatus } from "@/lib/matching/evaluate";
import type { RecallScope } from "@/lib/recalls/scope";

const PRESETS = [
  { label: "Les Lilas", note: "K101 on 0458", gtin: "4056489470458", lot: "K101", bb: "11/12/2026" },
  { label: "Belleville", note: "K101 on 0441: same lot, other barcode", gtin: "4056489470441", lot: "K101", bb: "11/12/2026" },
  { label: "Montreuil", note: "lot not recorded", gtin: "4056489470458", lot: "", bb: "" },
  { label: "K1OO", note: "letter O, not zero", gtin: "4056489470458", lot: "K1OO", bb: "10/12/2026" },
];

const STATUS: Record<MatchStatus, { text: string; cls: string }> = {
  RECORDED_MATCH: { text: "Recorded match", cls: "bg-tomato-soft text-tomato border-tomato" },
  NOT_MATCHING_THIS_NOTICE: { text: "Not matching this notice", cls: "bg-stone-soft text-stone border-stone" },
  NEEDS_EVIDENCE: { text: "Needs evidence", cls: "bg-ochre-soft text-ochre border-ochre" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function DeliveryCheck({ scope }: { scope: RecallScope }) {
  const [gtin, setGtin] = useState(PRESETS[0].gtin);
  const [lot, setLot] = useState(PRESETS[0].lot);
  const [bb, setBb] = useState(PRESETS[0].bb);

  const result = evaluateMatch(scope, { gtinRaw: gtin || null, lotRaw: lot || null, bestBeforeRaw: bb || null });
  const s = STATUS[result.status];
  const input =
    "mt-1 w-full border border-rule-strong bg-card px-3 py-2 font-mono text-base tabular-nums text-ink placeholder:text-muted";

  return (
    <div className="grid gap-0 border border-ink bg-card lg:grid-cols-2">
      <div className="border-b border-ink p-6 lg:border-r lg:border-b-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Try a recorded delivery</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = p.gtin === gtin && p.lot === lot && p.bb === bb;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setGtin(p.gtin);
                  setLot(p.lot);
                  setBb(p.bb);
                }}
                aria-pressed={active}
                className={`border px-3 py-1.5 text-left text-sm ${
                  active ? "border-forest bg-forest text-card" : "border-rule-strong text-ink hover:border-forest hover:text-forest"
                }`}
              >
                <span className="font-semibold">{p.label}</span>{" "}
                <span className={active ? "text-forest-soft" : "text-muted"}>({p.note})</span>
              </button>
            );
          })}
        </div>
        <div className="mt-6 grid gap-4">
          <label className="block text-sm font-medium">
            Barcode (GTIN)
            <input className={input} value={gtin} onChange={(e) => setGtin(e.target.value)} inputMode="numeric" placeholder="4056489470458" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">
              Lot code
              <input className={input} value={lot} onChange={(e) => setLot(e.target.value)} placeholder="not recorded" />
            </label>
            <label className="block text-sm font-medium">
              Best before <span className="font-normal text-muted">(optional)</span>
              <input className={input} value={bb} onChange={(e) => setBb(e.target.value)} placeholder="dd/mm/yyyy" />
            </label>
          </div>
        </div>
        <p className="mt-5 border-t border-rule pt-4 text-sm text-muted">
          A name-only check would flag every preset here: all four are &ldquo;Les Vergers Gourmands compote bio&rdquo;.
        </p>
      </div>

      <div className="p-6" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Result from the real rules</p>
        <p className={`mt-3 inline-block border-l-4 px-4 py-2 font-display text-3xl font-semibold ${s.cls}`}>{s.text}</p>
        <ol className="mt-5 space-y-2 text-[15px]">
          {result.reasons.map((r, i) => (
            <li key={r} className="flex gap-3">
              <span className="font-mono text-sm text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span>{REASON_TEXT[r]}</span>
            </li>
          ))}
        </ol>
        {result.missingFields.length > 0 && (
          <p className="mt-4 text-sm">
            Evidence to request from the kitchen:{" "}
            <span className="font-mono">{result.missingFields.join(", ").replace("best_before", "best-before")}</span>
          </p>
        )}
        <div className="mt-5 border-t border-rule pt-4 text-sm">
          <p className="text-muted">Notice entry matched</p>
          {result.matchedEntry ? (
            <p className="mt-1 font-mono tabular-nums">
              {result.matchedEntry.gtinRaw} / {result.matchedEntry.lot?.toUpperCase()} / {fmtDate(result.matchedEntry.date)}
            </p>
          ) : (
            <p className="mt-1">None</p>
          )}
        </div>
        <p className="mt-4 text-xs text-muted">
          A recorded match means the recorded batch is listed. It does not prove the item is still in stock.
        </p>
      </div>
    </div>
  );
}
