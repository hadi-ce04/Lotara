import { AlertTriangle, Bot, ClipboardPen, UserRoundCheck } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { confirmReadingAction, extractLabelAction } from "@/app/actions";
import type { LabelExtraction } from "@/lib/ai/extract";
import { fmtDateTime } from "./format";

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

const METHOD: Record<string, string> = {
  ai_extraction_confirmed_by_human: "AI transcription confirmed by a person",
  human_corrected_ai_extraction: "Corrected by a person (differs from AI transcription)",
  human_reading_of_photo: "Read by a person",
};
const uploader = (id: string) => (id.startsWith("participant:") ? "the kitchen" : id);
const FIELD: Record<string, string> = { lot_text: "Lot", best_before_text: "Date", gtin_digits: "Barcode" };

/** One label photo, its raw AI transcription (unconfirmed), and the human confirmation step. */
export function LabelEvidence({ doc, caseId, version, items, aiAvailable }: { doc: Doc; caseId: string; version: number; items: Item[]; aiAvailable: boolean }) {
  const x = doc.extraction_status === "COMPLETED" ? doc.extraction : null;
  // Inputs are never pre-filled from the model: the person types what they read on the photo,
  // and the server records whether it agrees with the AI transcription.

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <figure className="space-y-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image route */}
          <img src={`/api/documents/${doc.id}`} alt="Uploaded label photo" className="max-h-80 w-full rounded-lg bg-slate-100 object-contain ring-1 ring-slate-200" />
          <figcaption className="text-xs text-slate-500">
            Sent by {uploader(doc.uploaded_by)} · {fmtDateTime(doc.created_at)} · {Math.round(doc.byte_size / 1024)} KB · original image preserved
          </figcaption>
        </figure>

        <div className="self-start rounded-lg border border-dashed border-violet-300 bg-violet-50/40 p-4 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-800">
            <Bot className="size-4" aria-hidden /> AI transcription · unconfirmed
          </p>
          <p className="mt-1 text-xs text-slate-600">What the AI read on the photo. It changes nothing until a person confirms the values below.</p>
          {x ? (
            <>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-slate-500">Lot</dt><dd className="font-mono text-base font-semibold">{x.lot_text ?? "—"}</dd>
                <dt className="text-slate-500">Date</dt><dd className="font-mono">{x.best_before_text ?? "—"} {x.date_label_type && <span className="font-sans text-xs text-slate-500">({x.date_label_type.replace("_", "-")})</span>}</dd>
                <dt className="text-slate-500">Barcode</dt><dd className="font-mono">{x.gtin_digits ?? "—"}</dd>
                <dt className="text-slate-500">Brand</dt><dd>{x.brand_text ?? "—"}</dd>
                <dt className="text-slate-500">Legible</dt><dd>{x.legible ? "yes" : "no"}</dd>
              </dl>
              {x.ambiguous.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-md bg-amber-50 p-2 text-xs text-amber-950 ring-1 ring-amber-200">
                  {x.ambiguous.map((a, i) => (
                    <li key={i} className="flex gap-1.5"><AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden /> <span><strong>{FIELD[a.field] ?? a.field}:</strong> {a.detail}</span></li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-500">{x.notes} · {doc.extraction_model} · {doc.extraction_ms} ms</p>
            </>
          ) : doc.extraction_status === "FAILED" ? (
            <p className="mt-3 text-sm text-red-700">AI transcription failed ({doc.extraction_error}). Read the photo yourself.</p>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              {aiAvailable ? "Not transcribed yet (the AI investigator usually does this after an upload)." : "AI is not available on this server. Read the photo yourself."}
            </p>
          )}
          {aiAvailable && !x && !doc.confirmed && (
            <ActionForm action={extractLabelAction} submitLabel="Transcribe with AI" pendingLabel="Reading label…" variant="secondary" size="sm" className="mt-3">
              <input type="hidden" name="caseId" value={caseId} />
              <input type="hidden" name="documentId" value={doc.id} />
            </ActionForm>
          )}
        </div>
      </div>

      {doc.confirmed ? (
        <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><UserRoundCheck className="size-4" aria-hidden /> Confirmed by a person</p>
          <ul className="space-y-1 text-sm">
            {items.map((e) => (
              <li key={e.id}>
                Confirmed {e.field_name.replace("_", "-")}: <span className="font-mono font-semibold">{e.raw_value}</span>
                <span className="text-xs text-slate-500"> · {METHOD[e.extraction_method] ?? e.extraction_method} · {e.confirmed_by}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-sky-200 bg-sky-50/50 p-4">
          <ActionForm action={confirmReadingAction} submitLabel="Confirm values & reassess" pendingLabel="Reassessing…">
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="documentId" value={doc.id} />
            <input type="hidden" name="version" value={version} />
            <p className="flex items-center gap-1.5 text-sm font-semibold"><ClipboardPen className="size-4" aria-hidden /> Your check: type exactly what the label shows</p>
            <p className="text-xs text-slate-600">Look at the photo, not the AI text. Your values decide the result.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Lot code
                <input name="lot" autoComplete="off" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-base" />
              </label>
              <label className="text-sm font-medium">Best before (DD/MM/YYYY)
                <input name="bestBefore" placeholder="10/12/2026" autoComplete="off" className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-base" />
              </label>
            </div>
            {x && x.ambiguous.length > 0 && <p className="flex items-center gap-1.5 text-xs text-amber-900"><AlertTriangle className="size-3.5" aria-hidden /> The AI flagged characters that are easy to confuse (such as O and 0). Read them carefully from the photo.</p>}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="attest" required className="mt-0.5 size-4" /> I compared these values with the photo myself.
            </label>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
