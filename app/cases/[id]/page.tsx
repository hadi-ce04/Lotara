import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink, FileSearch, Link2 } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReplayBanner } from "@/components/banner";
import { MatchBadge, ResponseBadge } from "@/components/status";
import { createParticipantToken, requireManager } from "@/lib/auth";
import { getCaseDetail } from "@/lib/cases";
import { REASON_TEXT, type Evaluation, type ReasonCode } from "@/lib/matching/evaluate";
import { normalizeGtin } from "@/lib/matching/normalize";
import type { RecallScope } from "@/lib/recalls/scope";
import {
  confirmReadingAction, investigateAction, managerUploadAction, markReviewedAction, requestStaffCheckAction,
} from "../../actions";

export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <>
      <ReplayBanner />
      <Suspense fallback={<p className="mx-auto mt-10 max-w-6xl px-4 text-slate-500">Loading case…</p>}>
        <CaseWorkspace params={params} />
      </Suspense>
    </>
  );
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

const ACTION_TEXT: Record<string, string> = {
  SET_ASIDE: "Set aside affected stock according to the notice",
  NONE_FOUND: "Checked: none of this product/lot found in stock",
  COULD_NOT_CHECK: "Could not check",
};

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{icon}{title}</h2>
      {children}
    </section>
  );
}

async function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const manager = await requireManager();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getCaseDetail(manager.tenantId, id);
  if (!detail) notFound();
  const { case: c, documents, evidence, requests, reports, runs, events } = detail;
  const scope: RecallScope = c.normalized_scope;
  const evaluation: Evaluation = c.evaluation;
  const caseGtin = normalizeGtin(c.gtin_raw);
  const openRequest = requests.find((r) => r.status === "OPEN");
  const kitchenLink = `/kitchen/${createParticipantToken(c.site_id)}`;
  const showKitchenLink = c.response_status !== "NOT_REQUESTED" || openRequest;
  const hidden = (extra: Record<string, string | number> = {}) =>
    Object.entries({ caseId: c.id, ...extra }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Overview
        </Link>
        <AutoRefresh />
      </div>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{c.site_name}</h1>
        <MatchBadge status={c.match_status} />
        <ResponseBadge status={c.response_status} />
        <span className="text-xs text-slate-500">case version {c.version}</span>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card title="Assessment">
            <ul className="space-y-1 text-sm">
              {(c.reason_codes as ReasonCode[]).map((r) => <li key={r}>• {REASON_TEXT[r]}</li>)}
            </ul>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr><th className="py-1">Field</th><th>Value used</th><th>Source</th><th>Notice entry</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {([
                  ["GTIN", evaluation.effective.gtin, evaluation.matchedEntry?.gtinRaw],
                  ["Lot", evaluation.effective.lot, evaluation.matchedEntry?.lot?.toUpperCase()],
                  ["Best before", evaluation.effective.bestBefore, evaluation.matchedEntry?.date],
                ] as const).map(([label, f, notice]) => (
                  <tr key={label}>
                    <td className="py-1.5 text-slate-500">{label}</td>
                    <td className="font-mono">{f.value ?? <em className="font-sans text-amber-800">missing</em>}</td>
                    <td className="text-xs">{f.source === "evidence" ? "Confirmed label reading" : f.source === "register" ? "Delivery register" : "—"}</td>
                    <td className="font-mono text-xs">{notice ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Official notice scope">
            <p className="text-sm">
              <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-800 underline">
                RappelConso {c.source_id} v{c.source_version} <ExternalLink className="size-3.5" aria-hidden />
              </a>{" "}
              · published {fmt(c.published_at)} · snapshot retrieved {fmt(c.retrieved_at)}
            </p>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">GTIN</th><th>Lot</th><th>Best before</th></tr></thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {scope.entries.map((e, i) => {
                  const sameGtin = caseGtin.ok && caseGtin.gtin14 === e.gtin14;
                  return (
                    <tr key={i} className={sameGtin ? "bg-sky-50" : ""}>
                      <td className="py-1">{e.gtinRaw}{sameGtin && <span className="ml-2 font-sans text-xs text-sky-800">this delivery&apos;s GTIN</span>}</td>
                      <td>{e.lot ? e.lot.toUpperCase() : "all lots"}</td>
                      <td>{e.date ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-sm"><span className="text-slate-500">Reason (official, French):</span> {c.reason}</p>
            <p className="text-sm"><span className="text-slate-500">Official instructions:</span> {c.instructions?.split("|").join(" · ")}</p>
            <p className="mt-2 text-xs text-slate-500">
              The source dataset lowercases text, so lot codes are compared case-insensitively. No other character
              substitutions (such as O/0) are made.
            </p>
          </Card>

          <Card title="Recorded delivery (synthetic)">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-slate-500">Register reference</dt><dd>{c.source_ref}</dd>
              <dt className="text-slate-500">Supplier</dt><dd>{c.supplier}</dd>
              <dt className="text-slate-500">Product (as recorded)</dt><dd>{c.product_name_raw}</dd>
              <dt className="text-slate-500">GTIN</dt><dd className="font-mono">{c.gtin_raw ?? "—"}</dd>
              <dt className="text-slate-500">Lot</dt><dd className="font-mono">{c.lot_raw ?? <em className="font-sans text-amber-800">not recorded</em>}</dd>
              <dt className="text-slate-500">Best before</dt><dd className="font-mono">{c.best_before_raw ?? "—"}</dd>
              <dt className="text-slate-500">Received</dt><dd>{fmt(c.received_at)} · {Number(c.quantity)} {c.unit}</dd>
            </dl>
            <p className="mt-2 text-xs text-slate-500">A historical delivery does not prove the product is still in stock.</p>
          </Card>

          <Card title="Investigation runs" icon={<FileSearch className="size-4" aria-hidden />}>
            <ActionForm action={investigateAction} submitLabel="Run investigation" pendingLabel="Investigating…" variant="secondary">
              {hidden()}
            </ActionForm>
            <p className="mt-2 text-xs text-slate-500">
              Bounded rule-based run (max 6 steps). Model-assisted label extraction is not enabled yet; a person reads
              and confirms label values.
            </p>
            {runs.map((r) => (
              <div key={r.id} className="mt-4 rounded-md border border-slate-100 p-3 text-sm">
                <p className="font-medium">{r.status} · {r.method} · {fmt(r.started_at)}</p>
                <ol className="mt-1 list-decimal pl-5 text-xs text-slate-600">
                  {r.steps.map((s: { step_index: number; tool_name: string; elapsed_ms: number }) => (
                    <li key={s.step_index}><span className="font-mono">{s.tool_name}</span> · {s.elapsed_ms} ms</li>
                  ))}
                </ol>
                {r.summary && <p className="mt-1 text-xs">{r.summary}</p>}
              </div>
            ))}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Evidence">
            {openRequest ? (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
                <p className="font-medium">Open evidence request · {openRequest.requested_fields.join(", ")}</p>
                <p className="mt-1">{openRequest.request_text}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-600">No open evidence request.</p>
            )}

            {documents.map((d) => (
              <div key={d.id} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image route */}
                <img src={`/api/documents/${d.id}`} alt="Uploaded label photo" className="w-full rounded-md ring-1 ring-slate-200" />
                <p className="text-xs text-slate-500">Uploaded by {d.uploaded_by} · {fmt(d.created_at)} · {Math.round(d.byte_size / 1024)} KB</p>
                {d.confirmed ? (
                  <ul className="text-sm">
                    {evidence.filter((e) => e.document_id === d.id).map((e) => (
                      <li key={e.id}>Confirmed {e.field_name.replace("_", "-")}: <span className="font-mono">{e.raw_value}</span> by {e.confirmed_by}</li>
                    ))}
                  </ul>
                ) : (
                  <ActionForm action={confirmReadingAction} submitLabel="Confirm reading & reassess" pendingLabel="Reassessing…">
                    {hidden({ documentId: d.id, version: c.version })}
                    <p className="text-sm font-medium">Read the label in the photo and type exactly what it shows:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-sm">Lot code<input name="lot" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 font-mono" /></label>
                      <label className="text-sm">Best before (DD/MM/YYYY)<input name="bestBefore" placeholder="10/12/2026" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 font-mono" /></label>
                    </div>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="attest" required className="mt-1" /> I read these values from this photo myself.
                    </label>
                  </ActionForm>
                )}
              </div>
            ))}

            <details className="mt-4 border-t border-slate-100 pt-3 text-sm">
              <summary className="cursor-pointer text-slate-600">Upload a label photo as manager</summary>
              <ActionForm action={managerUploadAction} submitLabel="Upload photo" pendingLabel="Uploading…" variant="secondary" className="mt-2 space-y-2">
                {hidden()}
                <input type="file" name="photo" accept="image/jpeg,image/png" required className="block text-sm" />
              </ActionForm>
            </details>
          </Card>

          <Card title="Staff response">
            {c.match_status !== "NOT_MATCHING_THIS_NOTICE" && c.response_status === "NOT_REQUESTED" && (
              <ActionForm action={requestStaffCheckAction} submitLabel="Request kitchen stock check" pendingLabel="Requesting…">
                {hidden()}
              </ActionForm>
            )}
            {showKitchenLink && (
              <p className="mt-3 text-sm">
                <Link href={kitchenLink} target="_blank" className="inline-flex items-center gap-1 text-sky-800 underline">
                  <Link2 className="size-4" aria-hidden /> Open {c.site_name} kitchen page
                </Link>
                <span className="block text-xs text-slate-500">Signed, site-scoped participant link (valid 7 days). Share only with that kitchen.</span>
              </p>
            )}
            {reports.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No staff report yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {reports.map((r) => (
                  <li key={r.id} className="rounded-md bg-indigo-50 p-3 ring-1 ring-indigo-100">
                    <p className="font-medium">Participant reported: {ACTION_TEXT[r.reported_action]}</p>
                    <p className="text-xs">
                      {r.quantity_if_known !== null ? `${Number(r.quantity_if_known)} ${r.unit ?? ""} · ` : "Quantity not stated · "}
                      {fmt(r.reported_at)} · {r.actor_id} · {r.confirmation_method.replaceAll("_", " ")}
                    </p>
                    {r.note && <p className="mt-1 text-xs">“{r.note}”</p>}
                    <p className="mt-1 text-xs text-slate-500">A staff report, not independent verification.</p>
                  </li>
                ))}
              </ul>
            )}
            {c.response_status === "STAFF_REPORTED_ACTION" && (
              <ActionForm action={markReviewedAction} submitLabel="Mark reviewed complete" pendingLabel="Saving…" className="mt-4 space-y-2">
                {hidden({ version: c.version })}
              </ActionForm>
            )}
          </Card>

          <Card title="Event history">
            <ol className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="font-mono text-xs">{e.event_type}</p>
                  <p className="text-xs text-slate-500">{fmt(e.occurred_at)} · {e.actor_id} · {e.source}</p>
                  {e.event_type === "case.reassessed" && (
                    <p className="text-xs">{e.payload.from} → {e.payload.to} ({e.payload.trigger})</p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </main>
  );
}
