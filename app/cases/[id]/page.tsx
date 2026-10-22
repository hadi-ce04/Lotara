import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { AuditTrail } from "@/components/audit-trail";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReplayBanner } from "@/components/banner";
import { STAFF_ACTION_TEXT, verdict, whyLines } from "@/components/case-copy";
import { Comparison } from "@/components/comparison";
import { CopyLink } from "@/components/copy-link";
import { capitalize, fmtDateTime, fmtDay, fmtTime } from "@/components/format";
import { InvestigationRuns, MethodChip, runTotals, type Run } from "@/components/investigation-runs";
import { LabelEvidence } from "@/components/label-evidence";
import { CaseProgress } from "@/components/progress";
import { RecalledBatches } from "@/components/recalled-batches";
import { MatchBadge, ResponseBadge } from "@/components/status";
import { Card, Disclosure, Eyebrow, Fine, NotRecorded, TopBar } from "@/components/ui";
import { createParticipantToken, requireManager } from "@/lib/auth";
import { getCaseDetail } from "@/lib/cases";
import type { Evaluation, ReasonCode } from "@/lib/matching/evaluate";
import { normalizeGtin } from "@/lib/matching/normalize";
import type { RecallScope } from "@/lib/recalls/scope";
import { AI_MODEL, aiConfigured } from "@/lib/ai/client";
import {
  aiInvestigateAction, investigateAction, managerUploadAction, markReviewedAction, requestStaffCheckAction,
} from "../../actions";

export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <>
      <ReplayBanner />
      <TopBar><AutoRefresh /></TopBar>
      <Suspense fallback={<LoadingCase />}>
        <CaseWorkspace params={params} />
      </Suspense>
    </>
  );
}

function LoadingCase() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8" aria-busy="true">
      <p className="text-sm text-muted">Loading case…</p>
      <div className="h-56 animate-pulse rounded-sm bg-rule/60" />
      <div className="h-40 animate-pulse rounded-sm bg-rule/60" />
    </div>
  );
}

const FIELD_NAME: Record<string, string> = { lot: "lot code", best_before: "best-before date", gtin: "barcode" };

type NextKind = "done" | "confirm" | "investigate" | "await_photo" | "review" | "request_check" | "await_report" | "escalated" | "none";

async function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const manager = await requireManager();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getCaseDetail(manager.tenantId, id);
  if (!detail) notFound();
  const { case: c, documents, evidence, requests, reports, runs: rawRuns, events } = detail;
  const runs = rawRuns as Run[];
  const scope: RecallScope = c.normalized_scope;
  const evaluation: Evaluation = c.evaluation;
  const reasons = c.reason_codes as ReasonCode[];
  const caseGtin = normalizeGtin(c.gtin_raw);
  const openRequest = requests.find((r) => r.status === "OPEN");
  const kitchenLink = `/kitchen/${createParticipantToken(c.site_id)}`;
  const aiAvailable = aiConfigured();
  const showKitchenLink = c.response_status !== "NOT_REQUESTED" || Boolean(openRequest);
  const pendingDoc = documents.find((d) => !d.confirmed);
  const latestRun = runs[0];
  const latestReport = reports[0];
  const viaLabel = evaluation.effective.lot.source === "evidence" || evaluation.effective.bestBefore.source === "evidence";
  const hidden = (extra: Record<string, string | number> = {}) =>
    Object.entries({ caseId: c.id, ...extra }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  // Latest confirmed value per field (evidence rows are ordered oldest first).
  const confirmed: Record<string, string> = {};
  for (const e of evidence) confirmed[e.field_name] = e.raw_value;
  const hasConfirmed = Object.keys(confirmed).length > 0;

  const m = c.match_status;
  const r = c.response_status;
  const next: NextKind =
    r === "REVIEWED_COMPLETE" ? "done"
    : pendingDoc ? "confirm"
    : m === "NEEDS_EVIDENCE" ? (openRequest ? "await_photo" : "investigate")
    : m === "NOT_MATCHING_THIS_NOTICE" ? "none"
    : r === "STAFF_REPORTED_ACTION" ? "review"
    : r === "REQUESTED" ? "await_report"
    : r === "ESCALATED" ? "escalated"
    : "request_check";
  const linkInNext = next === "await_photo" || next === "await_report";
  const canRequestCheck = m !== "NOT_MATCHING_THIS_NOTICE" && r === "NOT_REQUESTED";

  const kitchenLinkBlock = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={kitchenLink} target="_blank" className="inline-flex items-center gap-1.5 rounded-sm bg-card px-3 py-2 text-sm font-medium text-harbour ring-1 ring-harbour/40 hover:bg-harbour-soft">
          Open {c.site_name} kitchen page
        </Link>
        <CopyLink href={kitchenLink} />
      </div>
      <Fine>Signed link for this kitchen only, valid 7 days. Share it only with that kitchen.</Fine>
    </div>
  );

  const nextStep: Record<NextKind, { title: string; body: ReactNode; tone: string; action?: ReactNode }> = {
    done: {
      title: "Reviewed complete",
      tone: "border-sage/40 bg-sage-soft",
      body: <>Nothing left to do for this kitchen. You reviewed the kitchen&apos;s report{latestReport ? ` (${STAFF_ACTION_TEXT[latestReport.reported_action].toLowerCase()})` : ""}. A staff report is not independent proof that stock was removed.</>,
    },
    confirm: {
      title: "Confirm what the label says",
      tone: "border-harbour/40 bg-harbour-soft",
      body: <>A label photo has arrived. Compare it with the AI transcription and type the lot code and best-before date yourself. The result is recalculated from your values.</>,
      action: (
        <a href="#evidence" className="inline-flex items-center gap-1.5 rounded-sm bg-forest px-3.5 py-2 text-sm font-medium text-paper hover:bg-forest-deep">
          Go to the label check         </a>
      ),
    },
    investigate: {
      title: "Find out which batch was delivered",
      tone: "border-ochre/40 bg-ochre-soft",
      body: aiAvailable
        ? <>The AI investigator re-reads the notice and the delivery record and, if information is missing, asks the kitchen for a label photo. The decision itself is made by fixed rules, not by the AI.</>
        : <>AI is not available on this server. The rule-based check does the same checks without AI and asks the kitchen for a label photo if information is missing.</>,
      action: aiAvailable ? (
        <ActionForm action={aiInvestigateAction} submitLabel="Run AI investigation" pendingLabel="AI investigating…" className="">{hidden()}</ActionForm>
      ) : (
        <ActionForm action={investigateAction} submitLabel="Rule-based check (no AI)" pendingLabel="Checking…" className="">{hidden()}</ActionForm>
      ),
    },
    await_photo: {
      title: "Waiting for the kitchen's label photo",
      tone: "border-ochre/40 bg-ochre-soft",
      body: <>{c.site_name} has been asked to photograph a label showing the {(openRequest?.requested_fields ?? ["lot"]).map((f: string) => FIELD_NAME[f] ?? f).join(" and ")}. Send them their kitchen page link if they don&apos;t have it yet. This page updates by itself when the photo arrives.</>,
      action: kitchenLinkBlock,
    },
    review: {
      title: "Review the kitchen's report",
      tone: "border-harbour/40 bg-harbour-soft",
      body: latestReport ? (
        <>Kitchen reported: <strong>{STAFF_ACTION_TEXT[latestReport.reported_action]}</strong>
          {latestReport.quantity_if_known !== null ? ` (${Number(latestReport.quantity_if_known)} ${latestReport.unit ?? ""})` : ""}. If this answers the notice, mark the case reviewed complete. A staff report is not independent verification.</>
      ) : <>The kitchen has reported. Read it below, then mark the case reviewed complete.</>,
      action: (
        <ActionForm action={markReviewedAction} submitLabel="Mark reviewed complete" pendingLabel="Saving…" className="">
          {hidden({ version: c.version })}
        </ActionForm>
      ),
    },
    request_check: {
      title: "Ask the kitchen to check its stock",
      tone: "border-tomato/40 bg-tomato-soft",
      body: <>{c.site_name} received a recalled batch. Ask them to check whether any is left and set it aside as the notice says. They will get a simple page to report what they did.</>,
      action: (
        <ActionForm action={requestStaffCheckAction} submitLabel="Request kitchen stock check" pendingLabel="Requesting…" className="">{hidden()}</ActionForm>
      ),
    },
    await_report: {
      title: "Waiting for the kitchen's stock-check report",
      tone: "border-harbour/40 bg-harbour-soft",
      body: <>{c.site_name} has been asked to check its stock and report what it did. Send them their kitchen page link if they don&apos;t have it yet.</>,
      action: kitchenLinkBlock,
    },
    escalated: {
      title: "Escalated",
      tone: "border-tomato/40 bg-tomato-soft",
      body: <>This case was escalated. Follow up with the kitchen directly.</>,
    },
    none: {
      title: "No action required by this notice",
      tone: "border-rule-strong bg-paper",
      body: <>This delivery does not meet the batch criteria of this notice. That is not a safety statement: other notices are checked separately.</>,
    },
  };
  const step = nextStep[next];

  const caveat =
    m === "NOT_MATCHING_THIS_NOTICE"
      ? "“Not matching this notice” only means this notice’s exact batch criteria are not met."
      : "A recorded delivery does not prove the product is still on site.";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink hover:underline">
        All kitchens (overview)
      </Link>

      <header className="space-y-2">
        <Eyebrow>Case · {capitalize(c.title)} · RappelConso {c.source_id}</Eyebrow>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight [font-variation-settings:'opsz'_144] sm:text-5xl">{c.site_name}</h1>
          <MatchBadge status={m} size="md" />
          <ResponseBadge status={r} size="md" />
        </div>
        <p className="text-xs text-muted">{c.city} · case version {c.version}</p>
      </header>

      {/* Situation + next step */}
      <section aria-labelledby="situation" className="rounded-sm border border-rule bg-card">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-3">
            <div>
              <h2 id="situation" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Situation</h2>
              <p className="mt-1 font-display text-2xl font-medium leading-snug text-ink">{verdict(m, reasons, { viaLabel })}</p>
              <p className="mt-1 text-sm text-muted">{caveat}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Why</h3>
              <ul className="mt-1 space-y-1 text-sm text-ink">
                {(whyLines(reasons).length ? whyLines(reasons) : ["The barcode is listed in this notice."]).map((w) => (
                  <li key={w} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-sm bg-rule-strong" />{w}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Decided by fixed matching rules from {viaLabel ? "the confirmed label reading and the delivery record" : "the delivery record (synthetic)"}.
                {latestRun && (
                  <> Last check: <MethodChip run={latestRun} /> at {fmtTime(latestRun.started_at)}{latestRun.status === "RUNNING" && <span className="ml-1 font-medium text-forest">Running…</span>}</>
                )}
              </p>
            </div>
          </div>

          <div className={`rounded-sm border-2 p-4 lg:col-span-2 ${step.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Next step</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-ink">{step.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{step.body}</p>
            {step.action && <div className="mt-4">{step.action}</div>}
          </div>
        </div>

        <div className="border-t border-rule px-5 py-5 sm:px-6">
          <CaseProgress
            match={m}
            response={r}
            evidence={{ requestOpen: Boolean(openRequest), photoWaitingForConfirmation: Boolean(pendingDoc), usedConfirmedLabel: viaLabel }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-rule bg-paper px-5 py-3 sm:px-6">
          <span className="mr-1 text-xs text-muted">Re-check this case:</span>
          {aiAvailable && next !== "investigate" && (
            <ActionForm action={aiInvestigateAction} submitLabel="Run AI investigation" pendingLabel="AI investigating…" variant="secondary" size="sm" className="">{hidden()}</ActionForm>
          )}
          {!(next === "investigate" && !aiAvailable) && (
            <ActionForm action={investigateAction} submitLabel="Rule-based check (no AI)" pendingLabel="Checking…" variant="secondary" size="sm" className="">{hidden()}</ActionForm>
          )}
          {!aiAvailable && <span className="text-xs text-muted">AI investigation is unavailable on this server (no API key configured).</span>}
        </div>
      </section>

      {/* Comparison */}
      <Card title="Recall vs. this delivery">
        <p className="mb-3 text-sm text-muted">
          Delivery record {c.source_ref} (synthetic): {c.product_name_raw} from {c.supplier}, received {fmtDay(c.received_at)}, {Number(c.quantity)} {c.unit}.
        </p>
        <Comparison
          entries={scope.entries}
          caseGtin14={caseGtin.ok ? caseGtin.gtin14 : null}
          matchedEntry={evaluation.matchedEntry}
          reasons={reasons}
          delivery={{ gtin: c.gtin_raw, lot: c.lot_raw, bestBefore: c.best_before_raw }}
          label={hasConfirmed ? { gtin: confirmed.gtin ?? null, lot: confirmed.lot ?? null, bestBefore: confirmed.best_before ?? null } : null}
        />
        <Fine className="mt-3">
          Lot codes are compared without regard to upper/lower case (the official dataset lowercases them). No other
          character substitutions, such as O and 0, are made. A recorded delivery does not prove the product is still in stock.
        </Fine>
      </Card>

      {/* Evidence */}
      <Card id="evidence" title="Label evidence">
        <div className="space-y-5">
          {openRequest && (
            <div className="rounded-sm bg-ochre-soft p-4 text-sm text-ochre ring-1 ring-ochre/40">
              <p className="font-semibold">Photo requested from the kitchen · {openRequest.requested_fields.map((f: string) => FIELD_NAME[f] ?? f).join(", ")}</p>
              <p className="mt-1 leading-relaxed">“{openRequest.request_text}”</p>
            </div>
          )}
          {documents.length === 0 && !openRequest && (
            <p className="text-sm text-muted">
              {m === "NEEDS_EVIDENCE" ? "No label photo yet. Run the investigation to ask the kitchen for one." : "No label photo was needed: the delivery record was enough to decide."}
            </p>
          )}
          {documents.length === 0 && openRequest && <p className="text-sm text-muted">No photo received yet.</p>}
          {documents.map((d) => (
            <LabelEvidence key={d.id} doc={d} caseId={c.id} version={c.version} aiAvailable={aiAvailable}
              items={evidence.filter((e) => e.document_id === d.id)} />
          ))}
          <details className="text-sm">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 text-muted hover:text-ink">
              Upload a label photo yourself
            </summary>
            <ActionForm action={managerUploadAction} submitLabel="Upload photo" pendingLabel="Uploading…" variant="secondary" className="mt-3 space-y-2">
              {hidden()}
              <input type="file" name="photo" accept="image/jpeg,image/png" required className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-2 file:text-sm file:font-medium" />
            </ActionForm>
          </details>
        </div>
      </Card>

      {/* Kitchen response */}
      <Card title="Kitchen response">
        <div className="space-y-4">
          {m === "NOT_MATCHING_THIS_NOTICE" && <p className="text-sm text-muted">No stock check is needed for this notice.</p>}
          {canRequestCheck && next !== "request_check" && (
            <div className="flex flex-wrap items-center gap-3">
              <ActionForm action={requestStaffCheckAction} submitLabel="Request kitchen stock check" pendingLabel="Requesting…" variant="secondary" className="">{hidden()}</ActionForm>
              <span className="text-xs text-muted">Optional now: ask the kitchen to check and set aside the stock while the batch is being confirmed.</span>
            </div>
          )}
          {showKitchenLink && !linkInNext && kitchenLinkBlock}
          {reports.length === 0 ? (
            m !== "NOT_MATCHING_THIS_NOTICE" && <p className="text-sm text-muted">No report from the kitchen yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {reports.map((rep) => (
                <li key={rep.id} className="rounded-sm bg-harbour-soft p-4 ring-1 ring-harbour-soft">
                  <p className="font-medium">Participant reported: {STAFF_ACTION_TEXT[rep.reported_action]}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {rep.quantity_if_known !== null ? `${Number(rep.quantity_if_known)} ${rep.unit ?? ""} · ` : "Quantity not stated · "}
                    {fmtDateTime(rep.reported_at)} · {rep.confirmation_method.replaceAll("_", " ")}
                  </p>
                  {rep.note && <p className="mt-1 text-sm">“{rep.note}”</p>}
                  <p className="mt-1 text-xs text-muted">A staff report, not independent verification.</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Technical depth */}
      <div className="space-y-3">
        <InvestigationDisclosure runs={runs} aiAvailable={aiAvailable} />

        <Disclosure title="Full notice scope" meta={`${scope.entries.length} recalled batches · RappelConso ${c.source_id} v${c.source_version}`}>
          <div className="space-y-4 text-sm">
            <p>
              <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-harbour underline">
                Official notice RappelConso {c.source_id} v{c.source_version}               </a>
              <span className="text-muted"> · published {fmtDateTime(c.published_at)} · saved copy retrieved {fmtDateTime(c.retrieved_at)}{c.replay ? " · historical replay" : ""}</span>
            </p>
            <RecalledBatches entries={scope.entries} highlightGtin14={caseGtin.ok ? caseGtin.gtin14 : null} />
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Reason (official, French)</dt><dd>{c.reason}</dd>
              <dt className="text-muted">Instructions (official, French)</dt><dd>{c.instructions?.split("|").join(" · ")}</dd>
              <dt className="text-muted">Delivery record</dt>
              <dd>
                {c.source_ref} · {c.supplier} · {c.product_name_raw} · barcode <span className="font-mono">{c.gtin_raw ?? "·"}</span> · lot{" "}
                {c.lot_raw ? <span className="font-mono">{c.lot_raw}</span> : <NotRecorded />} · best before{" "}
                {c.best_before_raw ? <span className="font-mono">{c.best_before_raw}</span> : <NotRecorded />} · received {fmtDateTime(c.received_at)}
              </dd>
            </dl>
          </div>
        </Disclosure>

        <Disclosure title="Audit trail" meta={`${events.length} events`}>
          <AuditTrail events={events} />
        </Disclosure>
      </div>
    </main>
  );
}

function InvestigationDisclosure({ runs, aiAvailable }: { runs: Run[]; aiAvailable: boolean }) {
  const aiRuns = runs.filter((r) => r.method.startsWith("ai"));
  const t = runTotals(runs);
  const title = aiRuns.length > 0 ? "How the AI investigated" : "How this case was checked";
  const meta = runs.length === 0
    ? "not run yet"
    : `${runs.length} run${runs.length === 1 ? "" : "s"} · ${t.steps} steps${t.tokens ? ` · ${t.tokens.toLocaleString("en")} tokens` : ""}${t.cost ? ` · ≈$${t.cost.toFixed(3)} est.` : ""}`;
  return (
    <Disclosure title={<span className="inline-flex items-center gap-2"> {title}</span>} meta={meta}>
      <p className="mb-4 text-xs leading-relaxed text-muted">
        {aiAvailable
          ? `The AI investigator (${AI_MODEL}) may only use a fixed list of tools, at most 8 per run and within 120 s. The match status is always decided by the fixed matching rules; label values read by the AI need a person's confirmation. It resumes by itself after a photo upload or a confirmation.`
          : "AI investigation is unavailable on this server (no API key configured). The rule-based check runs the same steps without AI and is labelled as such."}
      </p>
      <InvestigationRuns runs={runs} />
    </Disclosure>
  );
}
