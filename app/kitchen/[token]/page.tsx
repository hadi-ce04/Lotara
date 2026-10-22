import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { Suspense } from "react";
import { Camera, ClipboardList, ExternalLink } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { ReplayBanner } from "@/components/banner";
import { verifyParticipantToken } from "@/lib/auth";
import { getKitchenView } from "@/lib/cases";
import { kitchenUploadAction, staffReportAction } from "../../actions";

export default function KitchenPage({ params }: PageProps<"/kitchen/[token]">) {
  return (
    <>
      <ReplayBanner />
      <Suspense fallback={<p className="mx-auto mt-10 max-w-2xl px-4 text-slate-500">Loading…</p>}>
        <Kitchen params={params} />
      </Suspense>
    </>
  );
}

const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

async function Kitchen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection(); // token expiry and submission keys are per request
  const participant = verifyParticipantToken(decodeURIComponent(token));
  if (!participant) {
    return <p className="mx-auto mt-10 max-w-2xl px-4">This kitchen link is invalid or has expired. Ask your manager for a new one.</p>;
  }
  const view = await getKitchenView(participant.tenantId, participant.siteId);
  if (!view) return <p className="mx-auto mt-10 max-w-2xl px-4">Kitchen not found.</p>;
  const hidden = (caseId: string) => (
    <>
      <input type="hidden" name="token" value={decodeURIComponent(token)} />
      <input type="hidden" name="caseId" value={caseId} />
    </>
  );

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <header>
        <p className="text-sm text-slate-500">Kitchen response · demo participant page</p>
        <h1 className="text-2xl font-semibold">{view.site.name}</h1>
      </header>
      {view.cases.length === 0 && <p className="rounded-lg bg-white p-5 ring-1 ring-slate-200">No action is requested from this kitchen right now.</p>}
      {view.cases.map((c) => (
        <article key={c.id} className="space-y-5 rounded-lg bg-white p-5 ring-1 ring-slate-200">
          <div>
            <h2 className="text-lg font-semibold capitalize">Product recall: {c.title}</h2>
            <p className="text-sm text-slate-600">
              Published {fmtDate(c.published_at)} ·{" "}
              <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-800 underline">
                official notice <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </p>
            <p className="mt-2 text-sm">
              Our records show a delivery to your kitchen on {fmtDate(c.received_at)}: {c.product_name_raw}, GTIN{" "}
              <span className="font-mono">{c.gtin_raw}</span>, lot{" "}
              {c.lot_raw ? <span className="font-mono">{c.lot_raw}</span> : <em>not recorded</em>}, {Number(c.quantity)} {c.unit}.
              This does not mean the product is still in stock — please check.
            </p>
            <p className="mt-2 text-sm"><span className="text-slate-500">Official instructions (French):</span> {c.instructions?.split("|").join(" · ")}</p>
          </div>

          {c.open_request && (
            <section className="space-y-2 rounded-md bg-amber-50 p-4 ring-1 ring-amber-200">
              <h3 className="flex items-center gap-2 font-medium"><Camera className="size-4" aria-hidden /> Photo requested</h3>
              <p className="text-sm">{c.open_request}</p>
              {c.photos > 0 && <p className="text-xs text-slate-600">{c.photos} photo(s) received so far.</p>}
              <ActionForm action={kitchenUploadAction} submitLabel="Send photo" pendingLabel="Sending…" className="space-y-2">
                {hidden(c.id)}
                <input type="file" name="photo" accept="image/jpeg,image/png" capture="environment" required className="block text-sm" />
              </ActionForm>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 font-medium"><ClipboardList className="size-4" aria-hidden /> Report your stock check</h3>
            {c.last_report && (
              <p className="text-sm text-slate-600">Last report received {fmtDate(c.last_report.at)}. You can send a correction below.</p>
            )}
            <ActionForm action={staffReportAction} submitLabel="Send report" pendingLabel="Sending…">
              {hidden(c.id)}
              <input type="hidden" name="submissionKey" value={randomUUID()} />
              <fieldset className="space-y-1 text-sm">
                <legend className="mb-1 font-medium">What did you do?</legend>
                <label className="flex gap-2"><input type="radio" name="action" value="SET_ASIDE" required /> I set aside the affected stock as the notice says</label>
                <label className="flex gap-2"><input type="radio" name="action" value="NONE_FOUND" /> I checked: none of this product/lot is in stock</label>
                <label className="flex gap-2"><input type="radio" name="action" value="COULD_NOT_CHECK" /> I could not check</label>
              </fieldset>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label>Quantity (only if you counted)<input name="quantity" inputMode="decimal" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1" /></label>
                <label>Unit<input name="unit" placeholder="gourdes, cartons…" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1" /></label>
              </div>
              <label className="block text-sm">Note (optional)<textarea name="note" rows={2} maxLength={500} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1" /></label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="attest" required className="mt-1" /> I confirm this report describes what I did. It will be recorded as a staff report for the manager to review.
              </label>
            </ActionForm>
          </section>
        </article>
      ))}
    </main>
  );
}
