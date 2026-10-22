import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Camera, ClipboardList, ExternalLink, Info, Megaphone } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { ReplayBanner } from "@/components/banner";
import { capitalize } from "@/components/format";
import { TopBar } from "@/components/ui";
import { verifyParticipantToken } from "@/lib/auth";
import { getKitchenView } from "@/lib/cases";
import { kitchenUploadAction, staffReportAction } from "../../actions";

export default function KitchenPage({ params }: PageProps<"/kitchen/[token]">) {
  return (
    <>
      <ReplayBanner />
      <TopBar width="max-w-2xl" />
      <Suspense fallback={<p className="mx-auto mt-10 w-full max-w-2xl px-4 text-slate-500">Loading your kitchen page…</p>}>
        <Kitchen params={params} />
      </Suspense>
    </>
  );
}

const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });

const LAST_ACTION: Record<string, string> = {
  SET_ASIDE: "you set the stock aside",
  NONE_FOUND: "none was found in stock",
  COULD_NOT_CHECK: "you could not check",
};

function Notice({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="rounded-xl bg-white p-6 text-base ring-1 ring-slate-200">{children}</p>
    </main>
  );
}

function StepCard({ n, title, icon, children, tone = "bg-white ring-slate-200" }: { n: number; title: string; icon: ReactNode; children: ReactNode; tone?: string }) {
  return (
    <section className={`rounded-xl p-5 ring-1 ${tone}`}>
      <h3 className="flex items-center gap-3 text-lg font-semibold">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{n}</span>
        <span className="sr-only">Step {n}: </span>{title}
        <span className="ml-auto text-slate-400">{icon}</span>
      </h3>
      <div className="mt-3 space-y-3 text-base">{children}</div>
    </section>
  );
}

const radio = "flex min-h-14 cursor-pointer items-center gap-3 rounded-lg bg-white px-4 py-3 ring-1 ring-slate-300 has-[:checked]:bg-sky-50 has-[:checked]:ring-2 has-[:checked]:ring-sky-600";
const input = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base";

async function Kitchen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection(); // token expiry and submission keys are per request
  const participant = verifyParticipantToken(decodeURIComponent(token));
  if (!participant) return <Notice>This kitchen link is invalid or has expired. Ask your manager for a new one.</Notice>;
  const view = await getKitchenView(participant.tenantId, participant.siteId);
  if (!view) return <Notice>Kitchen not found.</Notice>;
  const hidden = (caseId: string) => (
    <>
      <input type="hidden" name="token" value={decodeURIComponent(token)} />
      <input type="hidden" name="caseId" value={caseId} />
    </>
  );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-6">
      <header>
        <p className="text-sm text-slate-500">Kitchen response · demo participant page</p>
        <h1 className="text-2xl font-semibold tracking-tight">{view.site.name}</h1>
      </header>
      {view.cases.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-base ring-1 ring-slate-200">No action is requested from this kitchen right now. Thank you.</p>
      )}
      {view.cases.map((c) => (
        <article key={c.id} className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-700">Product recall: {capitalize(c.title)}</h2>

          <StepCard n={1} title="What happened" icon={<Megaphone className="size-5" aria-hidden />}>
            <p>
              A product delivered to your kitchen is part of a recall notice. Our records show a delivery on{" "}
              <strong>{fmtDate(c.received_at)}</strong>:
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-4 text-sm">
              <dt className="text-slate-500">Product</dt><dd className="font-medium">{c.product_name_raw}</dd>
              <dt className="text-slate-500">Quantity</dt><dd>{Number(c.quantity)} {c.unit}</dd>
              <dt className="text-slate-500">Barcode</dt><dd className="break-all font-mono">{c.gtin_raw}</dd>
              <dt className="text-slate-500">Lot</dt><dd>{c.lot_raw ? <span className="font-mono">{c.lot_raw}</span> : <em className="text-amber-800">not recorded</em>}</dd>
            </dl>
            <p className="text-sm text-slate-700">This does not mean the product is still in stock. Please check.</p>
            <p className="text-sm">
              <span className="text-slate-500">Official instructions (French):</span> {c.instructions?.split("|").join(" · ")}{" "}
              <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-800 underline">
                official notice <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </p>
          </StepCard>

          <StepCard
            n={2}
            title={c.open_request ? "Send a photo of the label" : "Label photo"}
            icon={<Camera className="size-5" aria-hidden />}
            tone={c.open_request ? "bg-amber-50 ring-amber-300" : "bg-white ring-slate-200"}
          >
            {c.open_request ? (
              <>
                <p>{c.open_request}</p>
                {c.photos > 0 && <p className="text-sm font-medium text-slate-700">{c.photos} photo(s) received so far. You can send another if the first was unclear.</p>}
                <ActionForm action={kitchenUploadAction} submitLabel="Send photo" pendingLabel="Sending…" size="lg" className="space-y-3">
                  {hidden(c.id)}
                  <label className="block text-sm font-medium">
                    Take or choose a photo (JPEG or PNG)
                    <input type="file" name="photo" accept="image/jpeg,image/png" capture="environment" required
                      className="mt-2 block w-full rounded-lg border border-dashed border-amber-400 bg-white p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white" />
                  </label>
                </ActionForm>
              </>
            ) : (
              <p className="text-slate-600">
                {c.photos > 0 ? "Your photo was received. Nothing more is needed here." : "No photo is needed right now."}
              </p>
            )}
          </StepCard>

          <StepCard n={3} title="Tell us what you did" icon={<ClipboardList className="size-5" aria-hidden />}>
            {c.last_report && (
              <p className="rounded-lg bg-slate-50 p-3 text-sm">
                Last report received {fmtDate(c.last_report.at)}: {LAST_ACTION[c.last_report.action] ?? "received"}. You can send a correction below.
              </p>
            )}
            <ActionForm action={staffReportAction} submitLabel="Send report" pendingLabel="Sending…" size="lg" className="space-y-4">
              {hidden(c.id)}
              <input type="hidden" name="submissionKey" value={randomUUID()} />
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">What did you do?</legend>
                <label className={radio}><input type="radio" name="action" value="SET_ASIDE" required className="size-5" /> I set aside the affected stock as the notice says</label>
                <label className={radio}><input type="radio" name="action" value="NONE_FOUND" className="size-5" /> I checked: none of this product/lot is in stock</label>
                <label className={radio}><input type="radio" name="action" value="COULD_NOT_CHECK" className="size-5" /> I could not check</label>
              </fieldset>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="font-medium">Quantity (only if you counted)<input name="quantity" inputMode="decimal" className={input} /></label>
                <label className="font-medium">Unit<input name="unit" placeholder="gourdes, cartons…" className={input} /></label>
              </div>
              <label className="block text-sm font-medium">Note (optional)<textarea name="note" rows={2} maxLength={500} className={input} /></label>
              <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                <input type="checkbox" name="attest" required className="mt-0.5 size-5 shrink-0" /> I confirm this report describes what I did. It will be recorded as a staff report for the manager to review.
              </label>
            </ActionForm>
            <p className="flex gap-2 text-sm text-slate-600">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              Your answer goes straight to your manager. If you are unsure, choose &ldquo;I could not check&rdquo; and add a note. That is a useful answer too.
            </p>
          </StepCard>
        </article>
      ))}
    </main>
  );
}
