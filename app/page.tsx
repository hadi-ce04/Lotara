import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink, LogOut } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReplayBanner } from "@/components/banner";
import { MatchBadge, ResponseBadge } from "@/components/status";
import { requireManager } from "@/lib/auth";
import { getOverview, type MatchStatus, type ResponseStatus } from "@/lib/cases";
import { REASON_TEXT, type ReasonCode } from "@/lib/matching/evaluate";
import { logoutAction, resetDemoAction } from "./actions";

export default function OverviewPage() {
  return (
    <>
      <ReplayBanner />
      <Suspense fallback={<p className="mx-auto mt-10 max-w-6xl px-4 text-slate-500">Loading response overview…</p>}>
        <Overview />
      </Suspense>
    </>
  );
}

const fmt = (d: string | Date) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

async function Overview() {
  const manager = await requireManager();
  const { recall, cases, counts } = await getOverview(manager.tenantId);
  const by = (s: MatchStatus) => cases.filter((c) => c.match_status === s).length;
  const responded = (s: ResponseStatus) => cases.filter((c) => c.response_status === s).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recall response overview</h1>
          <p className="text-sm text-slate-600">
            {counts.sites} kitchens · {counts.deliveries} recorded deliveries (synthetic) · last event{" "}
            {counts.last_event ? fmt(counts.last_event) : "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AutoRefresh />
          <ActionForm action={resetDemoAction} submitLabel="Reset demo" pendingLabel="Resetting…" variant="danger" className="" />
          <form action={logoutAction}>
            <button className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </header>

      {!recall ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6">
          <p className="font-medium">No recall loaded yet.</p>
          <p className="text-sm text-slate-600">Use <em>Reset demo</em> to load the saved notice and synthetic deliveries.</p>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Source notice · RappelConso {recall.source_id} v{recall.source_version} · {recall.review_status.replaceAll("_", " ").toLowerCase()}
            </p>
            <h2 className="mt-1 text-lg font-semibold capitalize">{recall.title}</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-500">Published</dt><dd>{fmt(recall.published_at)}</dd></div>
              <div><dt className="text-slate-500">Retrieved (snapshot)</dt><dd>{fmt(recall.retrieved_at)}</dd></div>
              <div><dt className="text-slate-500">Mode</dt><dd>{recall.replay ? "Historical replay" : "Imported"}</dd></div>
            </dl>
            <p className="mt-3 text-sm">
              Scope: {recall.normalized_scope.entries.map((e: { gtinRaw: string; lot: string | null }) => `GTIN ${e.gtinRaw} ${e.lot ? `lot ${e.lot.toUpperCase()}` : "all lots"}`).join(" · ")}
            </p>
            <a href={recall.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-sky-800 underline">
              Official notice <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </section>

          <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Recorded match", by("RECORDED_MATCH")],
              ["Needs evidence", by("NEEDS_EVIDENCE")],
              ["Not matching", by("NOT_MATCHING_THIS_NOTICE")],
              ["Check requested", responded("REQUESTED")],
              ["Staff reported", responded("STAFF_REPORTED_ACTION")],
              ["Reviewed complete", responded("REVIEWED_COMPLETE")],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{n}</p>
              </div>
            ))}
          </section>

          <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Kitchen</th>
                  <th className="px-4 py-2">Delivery (recorded)</th>
                  <th className="px-4 py-2">Match</th>
                  <th className="px-4 py-2">Why</th>
                  <th className="px-4 py-2">Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cases.map((c) => (
                  <tr key={c.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/cases/${c.id}`} className="font-medium text-sky-800 underline">{c.site_name}</Link>
                      <p className="text-xs text-slate-500">{c.city}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>GTIN {c.gtin_raw ?? "—"} · lot {c.lot_raw ?? <em className="text-amber-800">not recorded</em>}</p>
                      <p className="text-xs text-slate-500">{c.source_ref} · {fmt(c.received_at)} · {Number(c.quantity)} {c.unit}</p>
                    </td>
                    <td className="px-4 py-3"><MatchBadge status={c.match_status} /></td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                      {(c.reason_codes as ReasonCode[]).filter((r) => r !== "GTIN_IN_NOTICE").map((r) => REASON_TEXT[r]).join(" ")}
                    </td>
                    <td className="px-4 py-3"><ResponseBadge status={c.response_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              Deliveries whose GTIN is not in the notice are not listed. A recorded match concerns the recorded lot; it
              does not prove stock is still on site. &ldquo;Not matching this notice&rdquo; is not a safety statement.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
