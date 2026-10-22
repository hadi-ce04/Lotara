import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CircleAlert, CircleHelp, CircleMinus, ClipboardCheck, ExternalLink, History, LogOut, Package } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReplayBanner } from "@/components/banner";
import { nextStepHint, needsAttention, verdict, whyLines, type Tone } from "@/components/case-copy";
import { capitalize, fmtDateTime, fmtDay, plural } from "@/components/format";
import { CaseProgress } from "@/components/progress";
import { RecalledBatches } from "@/components/recalled-batches";
import { MATCH, MatchBadge, ResponseBadge } from "@/components/status";
import { Eyebrow, Fine, NotRecorded, TopBar } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { getOverview, type MatchStatus, type ResponseStatus } from "@/lib/cases";
import type { ReasonCode } from "@/lib/matching/evaluate";
import type { RecallScope } from "@/lib/recalls/scope";
import { logoutAction, resetDemoAction } from "./actions";

export default function OverviewPage() {
  return (
    <>
      <ReplayBanner />
      <TopBar>
        <AutoRefresh />
        <form action={logoutAction}>
          <button className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </form>
      </TopBar>
      <Suspense fallback={<LoadingOverview />}>
        <Overview />
      </Suspense>
    </>
  );
}

function LoadingOverview() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8" aria-busy="true">
      <p className="text-sm text-slate-500">Loading response overview…</p>
      <div className="h-28 animate-pulse rounded-xl bg-slate-200/60" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl bg-slate-200/60" />)}
      </div>
    </div>
  );
}

type CaseRow = {
  id: string;
  match_status: MatchStatus;
  response_status: ResponseStatus;
  reason_codes: ReasonCode[];
  site_name: string;
  city: string;
  product_name_raw: string;
  gtin_raw: string | null;
  lot_raw: string | null;
  source_ref: string;
  received_at: string;
  quantity: string | number;
  unit: string;
};

// Urgent first, finished and non-matching last.
const ORDER = (c: CaseRow) =>
  c.response_status === "REVIEWED_COMPLETE" ? 3 : c.match_status === "NOT_MATCHING_THIS_NOTICE" ? 4 : c.match_status === "RECORDED_MATCH" ? 0 : 1;

async function Overview() {
  const manager = await requireManager();
  const { recall, cases: rows, counts } = await getOverview(manager.tenantId);
  const cases = [...(rows as CaseRow[])].sort((a, b) => ORDER(a) - ORDER(b) || a.site_name.localeCompare(b.site_name));
  const by = (s: MatchStatus) => cases.filter((c) => c.match_status === s).length;
  const responded = (s: ResponseStatus) => cases.filter((c) => c.response_status === s).length;
  const open = cases.filter((c) => needsAttention(c.match_status, c.response_status)).length;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:py-8">
      <header className="space-y-1">
        <Eyebrow>Manager workspace</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Recall response overview</h1>
        <p className="text-sm text-slate-600">
          Which of your kitchens received a recalled batch, and what to do next.
        </p>
      </header>

      {!recall ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Package className="mx-auto size-8 text-slate-400" aria-hidden />
          <p className="mt-2 font-medium">No recall loaded yet.</p>
          <p className="text-sm text-slate-600">Use <em>Reset demo</em> at the bottom of this page to load the saved notice and synthetic deliveries.</p>
        </section>
      ) : (
        <>
          {/* Headline summary */}
          <section aria-label="Summary" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xl font-semibold tracking-tight sm:text-2xl">
              {open === 0
                ? "No open actions for this notice."
                : `${open} of ${plural(cases.length, "kitchen", "kitchens")} ${open === 1 ? "needs" : "need"} your attention`}
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
              {by("RECORDED_MATCH") > 0 && (
                <li className="flex items-center gap-2"><CircleAlert className="size-4 text-red-700" aria-hidden />
                  <span><strong>{plural(by("RECORDED_MATCH"), "kitchen", "kitchens")}</strong> received a recalled batch</span></li>
              )}
              {by("NEEDS_EVIDENCE") > 0 && (
                <li className="flex items-center gap-2"><CircleHelp className="size-4 text-amber-700" aria-hidden />
                  <span><strong>{plural(by("NEEDS_EVIDENCE"), "kitchen", "kitchens")}</strong> {by("NEEDS_EVIDENCE") === 1 ? "needs" : "need"} a label photo to tell</span></li>
              )}
              {by("NOT_MATCHING_THIS_NOTICE") > 0 && (
                <li className="flex items-center gap-2"><CircleMinus className="size-4 text-slate-500" aria-hidden />
                  <span><strong>{plural(by("NOT_MATCHING_THIS_NOTICE"), "kitchen", "kitchens")}</strong> not matching this notice</span></li>
              )}
              {responded("REVIEWED_COMPLETE") > 0 && (
                <li className="flex items-center gap-2"><ClipboardCheck className="size-4 text-emerald-700" aria-hidden />
                  <span><strong>{responded("REVIEWED_COMPLETE")}</strong> reviewed complete</span></li>
              )}
            </ul>
          </section>

          {/* Notice */}
          <NoticeCard recall={recall} />

          {/* Kitchens */}
          <section aria-labelledby="kitchens" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="kitchens" className="text-lg font-semibold">Your kitchens</h2>
              <p className="text-xs text-slate-500">
                {counts.sites} kitchens · {counts.deliveries} recorded deliveries (synthetic) · last activity{" "}
                {counts.last_event ? fmtDateTime(counts.last_event) : "—"}
              </p>
            </div>
            {cases.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                No recorded delivery carries a barcode from this notice.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {cases.map((c) => <KitchenCard key={c.id} c={c} />)}
              </div>
            )}
            <Fine>
              Deliveries whose barcode is not in the notice are not listed. A recorded match concerns the recorded lot; a
              recorded delivery does not prove stock is still on site. &ldquo;Not matching this notice&rdquo; is not a
              safety statement.
            </Fine>
          </section>

          {/* Secondary counts */}
          <section aria-label="Counts" className="rounded-xl border border-slate-200 bg-white px-5 py-3">
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
              {([
                ["Recorded match", by("RECORDED_MATCH")],
                ["Needs evidence", by("NEEDS_EVIDENCE")],
                ["Not matching", by("NOT_MATCHING_THIS_NOTICE")],
                ["Check requested", responded("REQUESTED")],
                ["Staff reported", responded("STAFF_REPORTED_ACTION")],
                ["Reviewed complete", responded("REVIEWED_COMPLETE")],
              ] as const).map(([label, n]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <dt>{label}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{n}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500">Demo controls · resetting erases all progress and reloads the sample data.</p>
        <ActionForm action={resetDemoAction} submitLabel="Reset demo" pendingLabel="Resetting…" variant="danger" size="sm" className="" />
      </footer>
    </main>
  );
}

function NoticeCard({ recall }: { recall: { source_id: string; source_version: number; source_url: string; title: string; published_at: string; retrieved_at: string; replay: boolean; normalized_scope: RecallScope } }) {
  const scope = recall.normalized_scope;
  return (
    <section aria-labelledby="notice" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>The recall notice</Eyebrow>
          <h2 id="notice" className="mt-1 text-lg font-semibold">
            {capitalize(recall.title)}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            RappelConso {recall.source_id} v{recall.source_version} · published {fmtDay(recall.published_at)} · retrieved{" "}
            {fmtDay(recall.retrieved_at)} (saved copy)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {recall.replay && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
              <History className="size-3.5" aria-hidden /> Historical replay
            </span>
          )}
          <a href={recall.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-sky-800 ring-1 ring-sky-200 hover:bg-sky-50">
            Official notice <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>
      <p className="mt-4 mb-2 text-sm font-medium text-slate-700">Recalled batches (only these exact barcode + lot combinations):</p>
      <RecalledBatches entries={scope.entries} />
    </section>
  );
}

const TONE_TEXT: Record<Tone, string> = {
  attention: "text-red-800",
  evidence: "text-amber-900",
  neutral: "text-slate-600",
  waiting: "text-sky-800",
  complete: "text-emerald-800",
};

function KitchenCard({ c }: { c: CaseRow }) {
  const reasons = c.reason_codes;
  const next = nextStepHint(c.match_status, c.response_status);
  const why = whyLines(reasons);
  return (
    <article className={`flex flex-col rounded-xl border border-l-4 border-slate-200 bg-white shadow-sm ${c.response_status === "REVIEWED_COMPLETE" ? "border-l-emerald-500" : MATCH[c.match_status].accent}`}>
      <div className="space-y-3 p-5">
        <div>
          <h3 className="text-base font-semibold leading-tight">{c.site_name}</h3>
          <p className="text-xs text-slate-500">{c.city}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <MatchBadge status={c.match_status} size="md" />
          {c.response_status !== "NOT_REQUESTED" && <ResponseBadge status={c.response_status} size="md" />}
        </div>
        <p className="text-sm font-medium text-slate-900">{verdict(c.match_status, reasons)}</p>
        {why.length > 0 && <p className="text-xs leading-relaxed text-slate-600">Why: {why.join(" ")}</p>}

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 p-3 text-xs">
          <dt className="text-slate-500">Delivered</dt>
          <dd>{fmtDay(c.received_at)} · {Number(c.quantity)} {c.unit}</dd>
          <dt className="text-slate-500">Barcode</dt>
          <dd className="font-mono">{c.gtin_raw ?? <NotRecorded />}</dd>
          <dt className="text-slate-500">Lot</dt>
          <dd className="font-mono">{c.lot_raw ?? <NotRecorded />}</dd>
          <dt className="text-slate-500">Record</dt>
          <dd>{c.source_ref} <span className="text-slate-400">(synthetic)</span></dd>
        </dl>

        <div className="pt-1">
          <CaseProgress compact match={c.match_status} response={c.response_status} />
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
        <p className={`text-sm font-medium ${TONE_TEXT[next.tone]}`}>
          <span className="sr-only">Next step: </span>{next.text}
        </p>
        <Link
          href={`/cases/${c.id}`}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-2 text-sm font-medium ${next.tone === "neutral" || next.tone === "complete" ? "text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50" : "bg-slate-900 text-white hover:bg-slate-700"}`}
        >
          Open case <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
