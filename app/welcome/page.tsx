import type { Metadata } from "next";
import Link from "next/link";
import snapshot from "@/fixtures/development/recall-2026-04-0331.json";
import results from "@/fixtures/evaluation/results/latest.json";
import { adaptRappelConso, type RappelConsoRecord } from "@/lib/recalls/adapter";
import { DeliveryCheck } from "@/components/site/delivery-check";

export const metadata: Metadata = {
  title: "Lotara: which kitchens received the recalled batch?",
  description: "Hackathon prototype: exact-batch recall response for nursery kitchens, with measured results.",
};

const NOTICE_URL = "https://rappel.conso.gouv.fr/fiche-rappel/22174/interne";

type Ratio = { n: number; d: number; pct: number };
type Metrics = Record<string, Ratio | number>;

const ARMS: { key: string; name: string; m: Metrics }[] = [
  { key: "a", name: "Product name only", m: results.arms.nameBaseline.metrics.overall },
  { key: "b", name: "Structured rules", m: results.arms.structured.metrics.overall },
  { key: "c", name: "Rules + AI evidence collection", m: results.arms.investigation.after.overall },
];

const ROWS: { key: string; label: string; lower?: boolean }[] = [
  { key: "recordedMatchPrecision", label: "Recorded-match precision" },
  { key: "triageRecall", label: "Affected cases flagged (match or needs evidence)" },
  { key: "confirmedMatchRecall", label: "Affected cases confirmed as a match" },
  { key: "incorrectExclusionRate", label: "Affected cases wrongly excluded", lower: true },
  { key: "falseAlertRate", label: "Alerts or requests on non-affected cases", lower: true },
  { key: "agreementWithExpected", label: "Status equals expected status" },
];

function Barcode({ digits }: { digits: string }) {
  // Decorative bars derived from the digits; not a scannable EAN encoding.
  const bars = digits.split("").flatMap((c, i) => [1 + (Number(c) % 3), 1 + ((Number(c) + i) % 2)]);
  const starts = bars.map((_, i) => bars.slice(0, i).reduce((a, b) => a + b + 1, 0));
  const total = bars.reduce((a, b) => a + b + 1, 0);
  return (
    <svg viewBox={`0 0 ${total} 40`} className="h-12 w-full" aria-hidden="true" preserveAspectRatio="none">
      {bars.map((w, i) =>
        i % 2 === 0 ? <rect key={i} x={starts[i]} y={0} width={w} height={40} fill="currentColor" /> : null,
      )}
    </svg>
  );
}

export default function WelcomePage() {
  const notice = adaptRappelConso(snapshot.records[0] as unknown as RappelConsoRecord);
  const scope = notice.scope;
  const usage = results.arms.investigation.usage;
  const failuresC = results.arms.investigation.failuresAfter;

  return (
    <div className="min-h-full bg-paper text-ink">
      <header className="border-b-2 border-ink">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between px-6 py-4">
          <span className="font-display text-2xl font-semibold tracking-tight">Lotara</span>
          <nav className="flex gap-6 text-sm">
            <a href="#check" className="underline-offset-4 hover:underline">Check a delivery</a>
            <a href="#results" className="underline-offset-4 hover:underline">Results</a>
            <Link href="/login" className="font-semibold text-forest underline-offset-4 hover:underline">Manager demo</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid gap-10 border-b border-ink py-14 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Hackathon prototype / recall response for nursery kitchens</p>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] font-semibold tracking-tight [font-variation-settings:'opsz'_144] sm:text-7xl">
              A recall names a batch. <em className="font-normal text-forest">Which kitchen got it?</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed">
              Lotara checks each kitchen&rsquo;s recorded deliveries against the exact barcode and lot pairs in an official notice. When the lot
              was never written down, an AI investigator asks the kitchen for a label photo; a person confirms the reading, and the rules decide.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/login" className="bg-forest px-5 py-3 font-semibold text-card transition-colors hover:bg-forest-deep">
                Open the manager demo
              </Link>
              <a href={NOTICE_URL} className="border border-ink px-5 py-3 font-semibold transition-colors hover:bg-card" target="_blank" rel="noreferrer">
                Read the official notice
              </a>
            </div>
          </div>

          <aside className="self-start border-2 border-ink bg-card">
            <div className="border-b-2 border-ink bg-ink px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-paper">
              RappelConso {notice.sourceId}
            </div>
            <div className="p-4">
              <p className="font-display text-2xl font-semibold">Compote bio, gourde</p>
              <p className="text-sm capitalize text-muted">{scope.brand} &middot; published 1 May 2026</p>
              <table className="mt-4 w-full font-mono text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-ink text-left text-xs uppercase text-muted">
                    <th className="py-1 font-medium">GTIN</th>
                    <th className="py-1 font-medium">Lot</th>
                    <th className="py-1 text-right font-medium">Best before</th>
                  </tr>
                </thead>
                <tbody>
                  {scope.entries.map((e) => (
                    <tr key={e.gtin14 + e.lot} className="border-b border-rule">
                      <td className="py-1.5">{e.gtinRaw}</td>
                      <td className="py-1.5">{e.lot?.toUpperCase()}</td>
                      <td className="py-1.5 text-right">{e.date?.split("-").reverse().join("/")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-ink">
                <Barcode digits="4056489470458" />
              </div>
              <p className="mt-2 text-xs text-muted">Real notice, replayed as history. Kitchens and deliveries in the demo are synthetic.</p>
            </div>
          </aside>
        </section>

        <section id="check" className="border-b border-ink py-14">
          <p className="font-mono text-sm text-muted">01</p>
          <h2 className="mt-1 font-display text-4xl font-semibold tracking-tight">Check a delivery against the notice</h2>
          <p className="mt-3 max-w-2xl text-muted">
            This runs the same deterministic matcher the product uses, in your browser. No guessing: <span className="font-mono text-ink">K1OO</span> with a letter O is never treated as <span className="font-mono text-ink">K100</span>.
          </p>
          <div className="mt-8">
            <DeliveryCheck scope={scope} />
          </div>
        </section>

        <section id="results" className="border-b border-ink py-14">
          <p className="font-mono text-sm text-muted">02</p>
          <h2 className="mt-1 font-display text-4xl font-semibold tracking-tight">Measured, on {results.fixture.uniqueCases} synthetic cases</h2>
          <p className="mt-3 max-w-2xl text-muted">
            Three approaches, the same {results.fixture.uniqueCases} unique delivery cases ({results.arms.nameBaseline.metrics.overall.affected} truly
            affected), one notice. Counts first; percentages on denominators this small are fragile.
          </p>
          <div className="mt-8 overflow-x-auto border border-ink bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b-2 border-ink text-left">
                  <th className="p-3 font-semibold">Metric</th>
                  {ARMS.map((a) => (
                    <th key={a.key} className="p-3 text-right font-semibold">
                      <span className="font-mono text-xs uppercase text-muted">{a.key.toUpperCase()}</span>
                      <br />
                      {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-rule">
                  <td className="p-3">Declared recorded matches / needs evidence</td>
                  {ARMS.map((a) => (
                    <td key={a.key} className="p-3 text-right font-mono tabular-nums">
                      {String(a.m.declaredRecordedMatch)} / {String(a.m.needsEvidence)}
                    </td>
                  ))}
                </tr>
                {ROWS.map((r) => (
                  <tr key={r.key} className="border-b border-rule">
                    <td className="p-3">
                      {r.label}
                      {r.lower && <span className="text-muted"> (lower is better)</span>}
                    </td>
                    {ARMS.map((a) => {
                      const v = a.m[r.key] as Ratio;
                      return (
                        <td key={a.key} className="p-3 text-right font-mono tabular-nums">
                          <span className="text-base font-semibold">
                            {v.n}/{v.d}
                          </span>{" "}
                          <span className="text-muted">({v.pct}%)</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div>
              <h3 className="font-display text-2xl font-semibold">Where arm C still fails</h3>
              <ul className="mt-4 space-y-3 text-[15px]">
                {failuresC.map((f) => (
                  <li key={f.id} className="border-l-2 border-tomato pl-3">
                    <span className="font-mono font-semibold">{f.id}</span> {f.rationale}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">
                H09 and H10: the GTIN was read correctly from the label, but the confirmation form cannot record a GTIN, so the case stays open.
              </p>
            </div>
            <div>
              <h3 className="font-display text-2xl font-semibold">Limits of this evidence</h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px]">
                <li>Synthetic deliveries and clean rendered label images, not real phone photos.</li>
                <li>
                  n = {results.fixture.uniqueCases} unique cases against one notice; the AI arm ran once.
                </li>
                <li>A simulated person always confirmed the true printed values.</li>
                <li>
                  Estimated model cost US${usage.costUsd.toFixed(2)} in total, about US${usage.costPerInvestigatedCaseUsd.toFixed(2)} per investigated case;
                  mean {(usage.wallClockMsPerCase.mean / 1000).toFixed(1)} s machine time per case. Human time was not measured.
                </li>
                <li>Gold labels were written by the same team that built the system.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-8 py-14 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-display text-4xl font-semibold tracking-tight">
              See the whole case, <em className="font-normal">from notice to closed.</em>
            </h2>
            <p className="mt-3 max-w-xl text-muted">
              The manager demo walks three synthetic kitchens through the replayed notice: match, label photo request, confirmation, stock-check report,
              review.
            </p>
            <Link href="/login" className="mt-6 inline-block bg-forest px-5 py-3 font-semibold text-card transition-colors hover:bg-forest-deep">
              Open the manager demo
            </Link>
          </div>
          <p className="self-end border-t border-ink pt-4 text-sm text-muted">
            Prototype. Not a food-safety certification system. A recorded delivery does not prove current stock, and a staff report is not
            independent proof. AI investigator: Claude, allowlisted case-scoped tools, at most 8 tool calls and 120 s per segment; the rules stay the
            authority.
          </p>
        </section>
      </main>
    </div>
  );
}
