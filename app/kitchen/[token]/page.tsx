import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
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
      <Suspense fallback={<p className="mx-auto mt-10 w-full max-w-2xl px-4 text-muted">Loading your kitchen page…</p>}>
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
      <p className="rounded-sm bg-card p-6 text-base ring-1 ring-rule">{children}</p>
    </main>
  );
}

function StepCard({ n, title, children, tone = "bg-card ring-rule" }: { n: number; title: string; children: ReactNode; tone?: string }) {
  return (
    <section className={`rounded-sm p-5 ring-1 ${tone}`}>
      <h3 className="flex items-center gap-3 border-b border-rule-strong pb-2 font-display text-xl font-semibold">
        <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink font-display text-base font-semibold text-ink">{n}</span>
        <span className="sr-only">Step {n}: </span>{title}
      </h3>
      <div className="mt-3 space-y-3 text-base">{children}</div>
    </section>
  );
}

const radio = "flex min-h-14 cursor-pointer items-center gap-3 rounded-sm bg-card px-4 py-3 ring-1 ring-rule-strong has-[:checked]:bg-harbour-soft has-[:checked]:ring-2 has-[:checked]:ring-harbour";
const input = "mt-1 block w-full rounded-sm border border-rule-strong bg-card px-3 py-3 text-base";

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
        <p className="text-sm text-muted">Kitchen response · demo participant page</p>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight [font-variation-settings:'opsz'_96]">{view.site.name}</h1>
      </header>
      {view.cases.length === 0 && (
        <p className="rounded-sm bg-card p-6 text-base ring-1 ring-rule">No action is requested from this kitchen right now. Thank you.</p>
      )}
      {view.cases.map((c) => (
        <article key={c.id} className="space-y-4">
          <h2 className="font-display text-xl italic text-ink">Product recall: {capitalize(c.title)}</h2>

          <StepCard n={1} title="What happened">
            <p>
              A product delivered to your kitchen is part of a recall notice. Our records show a delivery on{" "}
              <strong>{fmtDate(c.received_at)}</strong>:
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-sm bg-paper p-4 text-sm">
              <dt className="text-muted">Product</dt><dd className="font-medium">{c.product_name_raw}</dd>
              <dt className="text-muted">Quantity</dt><dd>{Number(c.quantity)} {c.unit}</dd>
              <dt className="text-muted">Barcode</dt><dd className="break-all font-mono">{c.gtin_raw}</dd>
              <dt className="text-muted">Lot</dt><dd>{c.lot_raw ? <span className="font-mono">{c.lot_raw}</span> : <em className="text-ochre">not recorded</em>}</dd>
            </dl>
            <p className="text-sm text-ink">This does not mean the product is still in stock. Please check.</p>
            <p className="text-sm">
              <span className="text-muted">Official instructions (French):</span> {c.instructions?.split("|").join(" · ")}{" "}
              <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-harbour underline">
                official notice               </a>
            </p>
          </StepCard>

          <StepCard
            n={2}
            title={c.open_request ? "Send a photo of the label" : "Label photo"}
           
            tone={c.open_request ? "bg-ochre-soft ring-ochre/40" : "bg-card ring-rule"}
          >
            {c.open_request ? (
              <>
                <p>{c.open_request}</p>
                {c.photos > 0 && <p className="text-sm font-medium text-ink">{c.photos} photo(s) received so far. You can send another if the first was unclear.</p>}
                <ActionForm action={kitchenUploadAction} submitLabel="Send photo" pendingLabel="Sending…" size="lg" className="space-y-3">
                  {hidden(c.id)}
                  <label className="block text-sm font-medium">
                    Take or choose a photo (JPEG or PNG)
                    <input type="file" name="photo" accept="image/jpeg,image/png" capture="environment" required
                      className="mt-2 block w-full rounded-sm border border-dashed border-ochre bg-card p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-forest file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-paper" />
                  </label>
                </ActionForm>
              </>
            ) : (
              <p className="text-muted">
                {c.photos > 0 ? "Your photo was received. Nothing more is needed here." : "No photo is needed right now."}
              </p>
            )}
          </StepCard>

          <StepCard n={3} title="Tell us what you did">
            {c.last_report && (
              <p className="rounded-sm bg-paper p-3 text-sm">
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
              <label className="flex items-start gap-3 rounded-sm bg-paper p-3 text-sm">
                <input type="checkbox" name="attest" required className="mt-0.5 size-5 shrink-0" /> I confirm this report describes what I did. It will be recorded as a staff report for the manager to review.
              </label>
            </ActionForm>
            <p className="flex gap-2 text-sm text-muted">
                            Your answer goes straight to your manager. If you are unsure, choose &ldquo;I could not check&rdquo; and add a note. That is a useful answer too.
            </p>
          </StepCard>
        </article>
      ))}
    </main>
  );
}
