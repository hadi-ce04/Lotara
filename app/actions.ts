"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  endManagerSession, getManager, startManagerSession, verifyParticipantToken, verifyPassword,
} from "@/lib/auth";
import {
  CaseError, confirmLabelReading, investigateCase, markReviewed, requestStaffCheck, resetDemo,
  submitStaffReport, uploadLabelPhoto, type StaffAction,
} from "@/lib/cases";

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

export async function investigateAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const m = await manager();
    const result = await investigateCase(m.tenantId, str(form, "caseId"), m.actorId);
    return result.status === "NEEDS_EVIDENCE" ? "Investigation stopped: evidence requested" : "Investigation completed";
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
    return "Photo uploaded; read and confirm the label below";
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
    return result.duplicate ? "Already received — your report was recorded once." : "Report recorded. The manager will review it.";
  });
}
