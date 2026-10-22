import { AlertTriangle, Bot } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { confirmReadingAction, extractLabelAction } from "@/app/actions";
import type { LabelExtraction } from "@/lib/ai/extract";

type Doc = {
  id: string;
  byte_size: number;
  uploaded_by: string;
  created_at: string;
  confirmed: boolean;
  extraction_id: string | null;
  extraction_status: "COMPLETED" | "FAILED" | null;
  extraction: LabelExtraction | null;
  extraction_model: string | null;
  extraction_error: string | null;
  extraction_ms: number | null;
};
type Item = { id: string; document_id: string; field_name: string; raw_value: string; extraction_method: string; confirmed_by: string };

const fmt = (d: string) => new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });
const METHOD: Record<string, string> = {
  ai_extraction_confirmed_by_human: "AI transcription confirmed by a person",
  human_corrected_ai_extraction: "Corrected by a person (differs from AI transcription)",
  human_reading_of_photo: "Read by a person",
};

/** One label photo with its raw AI transcription and the human confirmation step. */
export function LabelEvidence({ doc, caseId, version, items, aiAvailable }: { doc: Doc; caseId: string; version: number; items: Item[]; aiAvailable: boolean }) {
  const x = doc.extraction_status === "COMPLETED" ? doc.extraction : null;
  // Inputs are never pre-filled from the model: the person types what they read on the photo,
  // and the server records whether it agrees with the AI transcription.

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image route */}
        <img src={`/api/documents/${doc.id}`} alt="Uploaded label photo" className="w-full rounded-md ring-1 ring-slate-200" />
        <div className="text-sm">
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-violet-800">
            <Bot className="size-3.5" aria-hidden /> AI transcription · unconfirmed
          </p>
          {x ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-slate-500">GTIN</dt><dd className="font-mono">{x.gtin_digits ?? "—"}</dd>
                <dt className="text-slate-500">Lot</dt><dd className="font-mono">{x.lot_text ?? "—"}</dd>
                <dt className="text-slate-500">Date</dt><dd className="font-mono">{x.best_before_text ?? "—"} {x.date_label_type && <span className="font-sans text-xs text-slate-500">({x.date_label_type.replace("_", "-")})</span>}</dd>
                <dt className="text-slate-500">Brand</dt><dd>{x.brand_text ?? "—"}</dd>
                <dt className="text-slate-500">Legible</dt><dd>{x.legible ? "yes" : "no"}</dd>
              </dl>
              {x.ambiguous.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {x.ambiguous.map((a, i) => (
                    <li key={i} className="flex gap-1"><AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {a.field.replace("_text", "").replace("_digits", "")}: {a.detail}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-500">{x.notes} · {doc.extraction_model} · {doc.extraction_ms} ms</p>
            </>
          ) : doc.extraction_status === "FAILED" ? (
            <p className="text-xs text-red-700">AI transcription failed ({doc.extraction_error}). Read the photo manually.</p>
          ) : (
            <p className="text-xs text-slate-500">{aiAvailable ? "Not transcribed yet (the AI investigator usually does this after an upload)." : "AI unavailable on this server; read the photo manually."}</p>
          )}
          {aiAvailable && !x && !doc.confirmed && (
            <ActionForm action={extractLabelAction} submitLabel="Transcribe with AI" pendingLabel="Reading label…" variant="secondary" className="mt-2">
              <input type="hidden" name="caseId" value={caseId} />
              <input type="hidden" name="documentId" value={doc.id} />
            </ActionForm>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">Uploaded by {doc.uploaded_by} · {fmt(doc.created_at)} · {Math.round(doc.byte_size / 1024)} KB · original image preserved</p>

      {doc.confirmed ? (
        <ul className="space-y-0.5 text-sm">
          {items.map((e) => (
            <li key={e.id}>
              Confirmed {e.field_name.replace("_", "-")}: <span className="font-mono">{e.raw_value}</span>
              <span className="text-xs text-slate-500"> · {METHOD[e.extraction_method] ?? e.extraction_method} · {e.confirmed_by}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ActionForm action={confirmReadingAction} submitLabel="Confirm values & reassess" pendingLabel="Reassessing…">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="version" value={version} />
          <p className="text-sm font-medium">Compare with the photo and type exactly what the label shows:</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Lot code
              <input name="lot" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 font-mono" />
            </label>
            <label className="text-sm">Best before (DD/MM/YYYY)
              <input name="bestBefore" placeholder="10/12/2026" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 font-mono" />
            </label>
          </div>
          {x && x.ambiguous.length > 0 && <p className="text-xs text-amber-900">The AI flagged ambiguous characters — read them carefully from the photo.</p>}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="attest" required className="mt-1" /> I compared these values with the photo myself.
          </label>
        </ActionForm>
      )}
    </div>
  );
}
