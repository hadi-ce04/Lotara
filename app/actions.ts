"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { aiConfigured, AiUnavailableError } from "@/lib/ai/client";
import { extractLabel } from "@/lib/ai/extract";
import { runAiInvestigation } from "@/lib/ai/investigate";
import {
  endManagerSession, getManager, startManagerSession, verifyParticipantToken, verifyPassword,
} from "@/lib/auth";
import { describePasswordHash } from "@/lib/password";
import {
  CaseError, confirmLabelReading, investigateCase, markReviewed, requestStaffCheck, resetDemo,
  submitStaffReport, uploadLabelPhoto, type StaffAction,
} from "@/lib/cases";
import { getPool } from "@/lib/db";

export type ActionState = { error?: string; ok?: string } | null;

// Authorization is enforced here, inside every action; ids from the form are
// only used after the tenant/site scope has been established on the server.
async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    refresh();
    return { ok: ok ?? "Saved" };
  } catch (err) {
    if (err instanceof CaseError) return { error: err.message };
    console.error("action failed:", err instanceof Error ? err.name : "unknown");
    return { error: "Something went wrong. Nothing was changed; try again." };
  }
}

async function manager() {
  const m = await getManager();
  if (!m) throw new CaseError("Your session has expired; sign in again");
  return m;
}

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const hashState = describePasswordHash(process.env.DEMO_ADMIN_PASSWORD_HASH);
  if (hashState === "missing" || hashState === "malformed") {
    console.error(`login unavailable: DEMO_ADMIN_PASSWORD_HASH is ${hashState}`);
    return { error: `Sign-in is not configured on this server (admin password hash ${hashState}).` };
  }
  if (!verifyPassword(str(form, "password"), process.env.DEMO_ADMIN_PASSWORD_HASH)) {
    return { error: "Incorrect password" };
  }
  await startManagerSession();
  redirect("/");
}

export async function logoutAction() {
  await endManagerSession();
  redirect("/login");
}

export async function resetDemoAction(): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    await resetDemo(m.tenantId, m.actorId);
    return "Demo data reset and assessed";
  });
}

const AI_ACTOR = "ai-investigator";

/** Starts an AI segment after the response is sent; failures are persisted on the run. */
function resumeAiLater(tenantId: string, caseId: string, trigger: "evidence_uploaded" | "evidence_confirmed") {
  if (!aiConfigured()) return;
  after(async () => {
    try {
      await runAiInvestigation(tenantId, caseId, AI_ACTOR, trigger);
    } catch (err) {
      // e.g. a segment is already running; nothing to change.
      console.error("AI resume skipped:", err instanceof Error ? err.message.slice(0, 80) : "unknown");
    }
  });
}

export async function investigateAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    const result = await investigateCase(m.tenantId, str(form, "caseId"), m.actorId);
    return result.status === "NEEDS_EVIDENCE" ? "Rule-based check: evidence requested" : "Rule-based check completed";
  });
}

export async function aiInvestigateAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    try {
      const r = await runAiInvestigation(m.tenantId, str(form, "caseId"), m.actorId, "manual");
      if (r.status === "FAILED") throw new CaseError(`AI investigation did not finish (${r.errorCategory}). Steps so far are saved.`);
      return r.status === "NEEDS_EVIDENCE" ? "AI investigation: evidence still needed" : "AI investigation completed";
    } catch (err) {
      if (err instanceof AiUnavailableError) throw new CaseError(`AI investigation unavailable (${err.category}). Use the rule-based check instead.`);
      throw err;
    }
  });
}

export async function extractLabelAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    if (!aiConfigured()) throw new CaseError("AI extraction unavailable (not configured). Read the label manually.");
    const docId = str(form, "documentId");
    const caseId = str(form, "caseId");
    const { rows } = await getPool().query(`SELECT 1 FROM documents WHERE tenant_id = $1 AND id = $2 AND case_id = $3`, [m.tenantId, docId, caseId]);
    if (!rows[0]) throw new CaseError("Photo not found for this case");
    await getPool().query(`DELETE FROM label_extractions WHERE tenant_id = $1 AND document_id = $2 AND status = 'FAILED'`, [m.tenantId, docId]);
    const x = await extractLabel(m.tenantId, docId);
    if (x.status !== "COMPLETED") throw new CaseError(`AI extraction failed (${x.errorCategory}). Read the label manually.`);
    return "AI transcription ready. Compare it with the photo";
  });
}

export async function requestStaffCheckAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    await requestStaffCheck(m.tenantId, m.actorId, str(form, "caseId"));
    return "Staff check requested";
  });
}

export async function managerUploadAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new CaseError("Choose a photo to upload");
    await uploadLabelPhoto({ tenantId: m.tenantId, actorId: m.actorId }, str(form, "caseId"), file);
    resumeAiLater(m.tenantId, str(form, "caseId"), "evidence_uploaded");
    return "Photo uploaded; confirm the label values below";
  });
}

export async function confirmReadingAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    if (form.get("attest") !== "on") throw new CaseError("Confirm that you read these values from the photo");
    const evaluation = await confirmLabelReading(m.tenantId, m.actorId, {
      caseId: str(form, "caseId"),
      documentId: str(form, "documentId"),
      expectedVersion: Number(str(form, "version")),
      lot: str(form, "lot"),
      bestBefore: str(form, "bestBefore"),
    });
    resumeAiLater(m.tenantId, str(form, "caseId"), "evidence_confirmed");
    return `Reassessed: ${evaluation.status.replaceAll("_", " ").toLowerCase()}`;
  });
}

export async function markReviewedAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    await markReviewed(m.tenantId, m.actorId, str(form, "caseId"), Number(str(form, "version")));
    return "Marked reviewed complete";
  });
}

// ------------------------------------------------------------- kitchen side

function participant(form: FormData) {
  const p = verifyParticipantToken(str(form, "token"));
  if (!p) throw new CaseError("This kitchen link is invalid or has expired");
  return p;
}

export async function kitchenUploadAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const p = participant(form);
    const file = form.get("photo");
    if (!(file instanceof File)) throw new CaseError("Choose a photo to upload");
    await uploadLabelPhoto(p, str(form, "caseId"), file);
    resumeAiLater(p.tenantId, str(form, "caseId"), "evidence_uploaded");
    return "Photo sent to the manager. Thank you.";
  });
}

const ACTIONS: StaffAction[] = ["SET_ASIDE", "NONE_FOUND", "COULD_NOT_CHECK"];

export async function staffReportAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const p = participant(form);
    const action = str(form, "action") as StaffAction;
    if (!ACTIONS.includes(action)) throw new CaseError("Choose what you did");
    if (form.get("attest") !== "on") throw new CaseError("Tick the confirmation box to send your report");
    const qtyRaw = str(form, "quantity").trim();
    const quantity = qtyRaw === "" ? null : Number(qtyRaw);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) throw new CaseError("Quantity must be a positive number or blank");
    const idempotencyKey = str(form, "submissionKey");
    if (!/^[0-9a-f-]{36}$/.test(idempotencyKey)) throw new CaseError("Reload the page and try again");
    const result = await submitStaffReport(p, {
      caseId: str(form, "caseId"),
      action,
      quantity,
      unit: quantity === null ? null : str(form, "unit").trim().slice(0, 40) || null,
      note: str(form, "note").trim().slice(0, 500) || null,
      idempotencyKey,
    });
    return result.duplicate ? "Already received. Your report was recorded once." : "Report recorded. The manager will review it.";
  });
}
