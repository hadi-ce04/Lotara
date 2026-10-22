import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import snapshot from "@/fixtures/development/recall-2026-04-0331.json";
import { getPool, withTransaction } from "./db";
import { DEMO_DELIVERIES, DEMO_SITES } from "./demo/data";
import { evaluateMatch, REASON_TEXT, type ConfirmedEvidence, type EvidenceField, type Evaluation } from "./matching/evaluate";
import { normalizeDate, normalizeGtin, normalizeLot } from "./matching/normalize";
import { adaptRappelConso, type RappelConsoRecord } from "./recalls/adapter";
import type { RecallScope } from "./recalls/scope";

export type MatchStatus = Evaluation["status"];
export type ResponseStatus = "NOT_REQUESTED" | "REQUESTED" | "STAFF_REPORTED_ACTION" | "REVIEWED_COMPLETE" | "ESCALATED";
export type StaffAction = "SET_ASIDE" | "NONE_FOUND" | "COULD_NOT_CHECK";

export class CaseError extends Error {}

const MAX_INVESTIGATION_STEPS = 6;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS_PER_CASE = 5;

export async function logEvent(
  client: PoolClient,
  e: { tenantId: string; caseId: string | null; type: string; source: string; actorId: string; payload?: object; idempotencyKey?: string },
) {
  await client.query(
    `INSERT INTO event_log (tenant_id, case_id, event_type, source, actor_id, payload, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (idempotency_key) DO NOTHING`,
    [e.tenantId, e.caseId, e.type, e.source, e.actorId, JSON.stringify(e.payload ?? {}), e.idempotencyKey ?? null],
  );
}

// ---------------------------------------------------------------- assessment

export type CaseContext = {
  caseId: string;
  version: number;
  matchStatus: MatchStatus;
  responseStatus: ResponseStatus;
  evaluation: Evaluation;
  siteId: string;
  noticeId: string;
  deliveryRef: string;
  scope: RecallScope;
  recalled: { gtinRaw: string | null; lotRaw: string | null; bestBeforeRaw: string | null };
  evidence: ConfirmedEvidence;
};

export async function loadCaseContext(client: PoolClient, tenantId: string, caseId: string, lock: boolean): Promise<CaseContext> {
  const { rows } = await client.query(
    `SELECT c.id, c.version, c.match_status, c.response_status, c.evaluation, c.site_id, r.normalized_scope, r.source_id,
            l.gtin_raw, l.lot_raw, l.best_before_raw, l.source_ref
       FROM cases c JOIN recall_versions r ON r.id = c.recall_version_id JOIN received_lots l ON l.id = c.received_lot_id
      WHERE c.tenant_id = $1 AND c.id = $2 ${lock ? "FOR UPDATE OF c" : ""}`,
    [tenantId, caseId],
  );
  const row = rows[0];
  if (!row) throw new CaseError("Case not found");
  const ev = await client.query(
    `SELECT id, field_name, raw_value FROM evidence_items WHERE tenant_id = $1 AND case_id = $2 ORDER BY created_at, id`,
    [tenantId, caseId],
  );
  return {
    caseId: row.id,
    version: row.version,
    matchStatus: row.match_status,
    responseStatus: row.response_status,
    evaluation: row.evaluation,
    siteId: row.site_id,
    noticeId: row.source_id,
    deliveryRef: row.source_ref,
    scope: row.normalized_scope,
    recalled: { gtinRaw: row.gtin_raw, lotRaw: row.lot_raw, bestBeforeRaw: row.best_before_raw },
    evidence: ev.rows.map((e) => ({ field: e.field_name as EvidenceField, value: e.raw_value, evidenceId: e.id })),
  };
}

/** Re-evaluates a locked case and writes the result with an optimistic version check. */
/** Key-order-independent JSON, so values read back from jsonb compare equal. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function reassess(client: PoolClient, tenantId: string, ctx: CaseContext, actorId: string, trigger: string) {
  const evaluation = evaluateMatch(ctx.scope, ctx.recalled, ctx.evidence);
  // Unchanged results are not rewritten, so repeated checks don't invalidate open forms.
  if (stableJson(evaluation) === stableJson(ctx.evaluation)) return evaluation;
  const updated = await client.query(
    `UPDATE cases SET match_status = $1, reason_codes = $2, evaluation = $3, version = version + 1, updated_at = now()
      WHERE tenant_id = $4 AND id = $5 AND version = $6`,
    [evaluation.status, evaluation.reasons, JSON.stringify(evaluation), tenantId, ctx.caseId, ctx.version],
  );
  if (updated.rowCount !== 1) throw new CaseError("Case changed concurrently; reload and try again");
  await logEvent(client, {
    tenantId,
    caseId: ctx.caseId,
    type: "case.reassessed",
    source: "rules",
    actorId,
    payload: { trigger, from: ctx.matchStatus, to: evaluation.status, reasons: evaluation.reasons },
  });
  return evaluation;
}

/** Deletes one tenant's records only, children before parents. */
export async function clearTenant(client: PoolClient, tenantId: string) {
  await client.query(`DELETE FROM run_steps WHERE run_id IN (SELECT id FROM investigation_runs WHERE tenant_id = $1)`, [tenantId]);
  await client.query(`UPDATE evidence_items SET extraction_id = NULL WHERE tenant_id = $1`, [tenantId]);
  for (const table of [
    "event_log", "staff_reports", "contact_attempts", "investigation_runs", "evidence_items",
    "evidence_requests", "label_extractions", "documents", "cases", "received_lots", "recall_versions", "sites",
  ]) {
    await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  }
}

export async function resetDemo(tenantId: string, actorId: string) {
  const record = snapshot.records[0] as unknown as RappelConsoRecord;
  const notice = adaptRappelConso(record);
  await withTransaction(async (client) => {
    await clearTenant(client, tenantId);
    for (const s of DEMO_SITES) {
      await client.query(
        `INSERT INTO sites (id, tenant_id, name, city, contact_name, synthetic) VALUES ($1, $2, $3, $4, $5, true)`,
        [s.id, tenantId, s.name, s.city, s.contactName],
      );
    }
    const recall = await client.query(
      `INSERT INTO recall_versions (tenant_id, source, source_id, source_version, source_url, title, raw_payload,
         normalized_scope, published_at, retrieved_at, content_hash, review_status, replay)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'REVIEWED_FOR_DEMO', true) RETURNING id`,
      [tenantId, notice.source, notice.sourceId, notice.sourceVersion, notice.sourceUrl, notice.title,
        JSON.stringify(record), JSON.stringify(notice.scope), notice.publishedAt, snapshot.retrieved_at, notice.contentHash],
    );
    for (const d of DEMO_DELIVERIES) {
      const gtin = normalizeGtin(d.gtin);
      await client.query(
        `INSERT INTO received_lots (tenant_id, site_id, supplier, product_name_raw, gtin_raw, gtin_normalized, lot_raw,
           best_before_raw, received_at, quantity, unit, source_ref, synthetic)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)`,
        [tenantId, d.siteId, d.supplier, d.productName, d.gtin, gtin.ok ? gtin.gtin14 : null, d.lot, d.bestBefore,
          d.receivedAt, d.quantity, d.unit, d.ref],
      );
    }
    await logEvent(client, { tenantId, caseId: null, type: "demo.reset", source: "manager", actorId, payload: { notice: notice.sourceId } });
    await assessRecall(client, tenantId, recall.rows[0].id, actorId);
  });
}

/** Bulk structured assessment: find candidate deliveries and evaluate each one. */
async function assessRecall(client: PoolClient, tenantId: string, recallVersionId: string, actorId: string) {
  const { rows: [recall] } = await client.query(
    `SELECT normalized_scope FROM recall_versions WHERE tenant_id = $1 AND id = $2`,
    [tenantId, recallVersionId],
  );
  const scope: RecallScope = recall.normalized_scope;
  const gtins = [...new Set(scope.entries.map((e) => e.gtin14))];
  // Candidates: a listed GTIN, or no usable GTIN but the notice brand in the product name.
  // Name similarity only nominates a candidate; it never confirms identity.
  const { rows: lots } = await client.query(
    `SELECT id, site_id, gtin_raw, lot_raw, best_before_raw FROM received_lots
      WHERE tenant_id = $1 AND (gtin_normalized = ANY($2) OR (gtin_normalized IS NULL AND product_name_raw ILIKE '%' || $3 || '%'))
      ORDER BY site_id, received_at`,
    [tenantId, gtins, scope.brand],
  );
  for (const lot of lots) {
    const evaluation = evaluateMatch(scope, { gtinRaw: lot.gtin_raw, lotRaw: lot.lot_raw, bestBeforeRaw: lot.best_before_raw });
    const inserted = await client.query(
      `INSERT INTO cases (tenant_id, recall_version_id, site_id, received_lot_id, match_status, response_status, reason_codes, evaluation)
       VALUES ($1, $2, $3, $4, $5, 'NOT_REQUESTED', $6, $7)
       ON CONFLICT (tenant_id, recall_version_id, site_id, received_lot_id) DO NOTHING RETURNING id`,
      [tenantId, recallVersionId, lot.site_id, lot.id, evaluation.status, evaluation.reasons, JSON.stringify(evaluation)],
    );
    if (inserted.rows[0]) {
      await logEvent(client, {
        tenantId,
        caseId: inserted.rows[0].id,
        type: "case.assessed",
        source: "rules",
        actorId,
        payload: { status: evaluation.status, reasons: evaluation.reasons },
      });
    }
  }
}

// ------------------------------------------------------------- investigation

/**
 * Bounded, rule-based investigation of one case. Each tool step is persisted
 * before the next. Model-assisted label extraction is a later milestone.
 */
export async function investigateCase(tenantId: string, caseId: string, actorId: string) {
  const pool = getPool();
  let runId: string;
  try {
    const run = await pool.query(
      `INSERT INTO investigation_runs (tenant_id, case_id, status, method)
       SELECT $1, $2, 'RUNNING', 'rules-v1' WHERE EXISTS (SELECT 1 FROM cases WHERE tenant_id = $1 AND id = $2)
       RETURNING id`,
      [tenantId, caseId],
    );
    if (!run.rows[0]) throw new CaseError("Case not found");
    runId = run.rows[0].id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new CaseError("An investigation is already running for this case");
    throw err;
  }

  let stepIndex = 0;
  const step = async <T>(client: PoolClient, tool: string, input: object, fn: () => Promise<T>): Promise<T> => {
    if (stepIndex >= MAX_INVESTIGATION_STEPS) throw new CaseError("Investigation step limit reached");
    const started = Date.now();
    const output = await fn();
    await client.query(
      `INSERT INTO run_steps (run_id, step_index, tool_name, input, output, elapsed_ms, status) VALUES ($1, $2, $3, $4, $5, $6, 'OK')`,
      [runId, stepIndex++, tool, JSON.stringify(input), JSON.stringify(output ?? null), Date.now() - started],
    );
    await client.query(`UPDATE investigation_runs SET step_count = $1 WHERE id = $2`, [stepIndex, runId]);
    return output;
  };

  try {
    const result = await withTransaction(async (client) => {
      const ctx = await loadCaseContext(client, tenantId, caseId, true);
      const caseGtin = normalizeGtin(ctx.recalled.gtinRaw);

      await step(client, "get_recall_scope", { case_id: caseId }, async () => ({
        brand: ctx.scope.brand,
        entries_for_gtin: ctx.scope.entries.filter((e) => caseGtin.ok && e.gtin14 === caseGtin.gtin14),
      }));
      const docs = await step(client, "get_case_evidence", { case_id: caseId }, async () => {
        const d = await client.query(`SELECT count(*)::int AS n FROM documents WHERE tenant_id = $1 AND case_id = $2`, [tenantId, caseId]);
        return { register: ctx.recalled, confirmed_evidence: ctx.evidence, documents: d.rows[0].n as number };
      });
      const evaluation = await step(client, "evaluate_match", { case_id: caseId }, () =>
        reassess(client, tenantId, ctx, actorId, "investigation"),
      );

      let requestText: string | null = null;
      if (evaluation.status === "NEEDS_EVIDENCE" && evaluation.missingFields.length > 0) {
        const open = await client.query(`SELECT id FROM evidence_requests WHERE case_id = $1 AND status = 'OPEN'`, [caseId]);
        if (!open.rows[0]) {
          requestText = buildEvidenceRequest(ctx, evaluation, docs.documents);
          await step(client, "request_evidence", { case_id: caseId, fields: evaluation.missingFields }, async () => {
            await client.query(
              `INSERT INTO evidence_requests (tenant_id, case_id, requested_fields, request_text, status, created_by)
               VALUES ($1, $2, $3, $4, 'OPEN', $5)`,
              [tenantId, caseId, evaluation.missingFields, requestText, actorId],
            );
            await logEvent(client, {
              tenantId, caseId, type: "evidence.requested", source: "investigation", actorId,
              payload: { fields: evaluation.missingFields },
            });
            return { requested: evaluation.missingFields };
          });
        }
      }

      const entry = evaluation.matchedEntry;
      const summary =
        `${evaluation.status.replaceAll("_", " ").toLowerCase()} — RappelConso ${ctx.noticeId}` +
        `${entry ? ` entry GTIN ${entry.gtinRaw} lot ${entry.lot?.toUpperCase() ?? "all"}` : ""}; delivery ${ctx.deliveryRef}. ` +
        evaluation.reasons.map((r) => REASON_TEXT[r]).join(" ") +
        (requestText ? " Evidence requested from the kitchen." : "");
      await step(client, "finish_investigation", { case_id: caseId }, async () => ({ summary }));
      const status = evaluation.status === "NEEDS_EVIDENCE" ? "NEEDS_EVIDENCE" : "COMPLETED";
      await client.query(
        `UPDATE investigation_runs SET status = $1, summary = $2, finished_at = now() WHERE id = $3`,
        [status, summary, runId],
      );
      await logEvent(client, { tenantId, caseId, type: "investigation.finished", source: "investigation", actorId, payload: { runId, status } });
      return { status, summary };
    });
    return result;
  } catch (err) {
    // The transaction rolled back; record the failure so the case stays resumable.
    await pool.query(
      `UPDATE investigation_runs SET status = 'FAILED', summary = $1, finished_at = now() WHERE id = $2`,
      [err instanceof CaseError ? err.message : "Unexpected error", runId],
    );
    throw err;
  }
}

const titleCase = (s: string) => s.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

export function buildEvidenceRequest(ctx: CaseContext, evaluation: Evaluation, documents: number): string {
  const gtin = ctx.recalled.gtinRaw ?? "unknown";
  const norm = normalizeGtin(gtin);
  const fields = evaluation.missingFields
    .map((f) => ({ lot: "the lot code", best_before: "the best-before date (DDM)", gtin: "the barcode number (GTIN)" })[f])
    .join(" and ");
  const lots = ctx.scope.entries
    .filter((e) => norm.ok && e.gtin14 === norm.gtin14 && e.lot)
    .map((e) => e.lot!.toUpperCase());
  return (
    `Please photograph a label of the ${titleCase(ctx.scope.brand)} ${ctx.scope.productTitle} pouches (GTIN ${gtin}) still in your stock, ` +
    `clearly showing ${fields}. ` +
    (lots.length ? `The recall lists lots ${lots.join(", ")} for this product, but no lot code was recorded at delivery. ` : "") +
    (documents > 0 ? "A previous photo did not resolve the question. " : "") +
    `Do not use or discard the stock until the check is complete.`
  );
}

// ------------------------------------------------------------------ evidence

function detectImage(bytes: Buffer): "image/png" | "image/jpeg" | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function uploadLabelPhoto(
  scope: { tenantId: string; actorId: string; siteId?: string },
  caseId: string,
  file: File,
) {
  if (file.size === 0) throw new CaseError("Choose a photo to upload");
  if (file.size > MAX_UPLOAD_BYTES) throw new CaseError("Photo is larger than 4 MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectImage(bytes);
  if (!mime) throw new CaseError("Only JPEG or PNG photos are supported");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return withTransaction(async (client) => {
    const ctx = await loadCaseContext(client, scope.tenantId, caseId, true);
    if (scope.siteId && ctx.siteId !== scope.siteId) throw new CaseError("Case not found");
    const count = await client.query(`SELECT count(*)::int AS n FROM documents WHERE case_id = $1`, [caseId]);
    if (count.rows[0].n >= MAX_PHOTOS_PER_CASE) throw new CaseError(`This case already has ${MAX_PHOTOS_PER_CASE} photos; ask the manager before sending more`);
    const doc = await client.query(
      `INSERT INTO documents (tenant_id, site_id, case_id, mime_type, byte_size, sha256, content, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [scope.tenantId, ctx.siteId, caseId, mime, bytes.length, sha256, bytes, scope.actorId],
    );
    await logEvent(client, {
      tenantId: scope.tenantId, caseId, type: "evidence.uploaded", source: scope.siteId ? "kitchen" : "manager",
      actorId: scope.actorId, payload: { documentId: doc.rows[0].id, mime, bytes: bytes.length, sha256 },
    });
    return doc.rows[0].id as string;
  });
}

/** A person reads the label photo and confirms the critical identifiers; the case is reassessed. */
export async function confirmLabelReading(
  tenantId: string,
  actorId: string,
  input: { caseId: string; documentId: string; expectedVersion: number; lot: string; bestBefore: string },
) {
  // If the photo was transcribed by the model, record whether the person accepted or corrected each value.
  const lot = normalizeLot(input.lot);
  const bestBefore = normalizeLot(input.bestBefore);
  if (!lot && !bestBefore) throw new CaseError("Enter at least the lot code read from the label");
  if (bestBefore && !normalizeDate(bestBefore)) throw new CaseError("Best-before must be DD/MM/YYYY");
  return withTransaction(async (client) => {
    const ctx = await loadCaseContext(client, tenantId, input.caseId, true);
    if (ctx.version !== input.expectedVersion) throw new CaseError("Case changed since you loaded it; reload and check again");
    const doc = await client.query(`SELECT id FROM documents WHERE tenant_id = $1 AND id = $2 AND case_id = $3`, [tenantId, input.documentId, input.caseId]);
    if (!doc.rows[0]) throw new CaseError("Photo not found for this case");
    const already = await client.query(`SELECT 1 FROM evidence_items WHERE document_id = $1`, [input.documentId]);
    if (already.rows[0]) throw new CaseError("This photo has already been read and confirmed");
    const x = await client.query(`SELECT id, fields FROM label_extractions WHERE document_id = $1 AND status = 'COMPLETED'`, [input.documentId]);
    const extraction = x.rows[0] as { id: string; fields: { lot_text: string | null; best_before_text: string | null } } | undefined;
    for (const [field, value] of [["lot", lot], ["best_before", bestBefore]] as const) {
      if (!value) continue;
      const extracted = extraction ? (field === "lot" ? extraction.fields.lot_text : extraction.fields.best_before_text) : null;
      const method = !extraction
        ? "human_reading_of_photo"
        : extracted !== null && extracted.trim() === value
          ? "ai_extraction_confirmed_by_human"
          : "human_corrected_ai_extraction";
      const item = await client.query(
        `INSERT INTO evidence_items (tenant_id, case_id, document_id, field_name, raw_value, extraction_method, confirmed_by, extraction_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [tenantId, input.caseId, input.documentId, field, value, method, actorId, extraction?.id ?? null],
      );
      ctx.evidence.push({ field, value, evidenceId: item.rows[0].id });
    }
    await logEvent(client, {
      tenantId, caseId: input.caseId, type: "evidence.confirmed", source: "manager", actorId,
      payload: { documentId: input.documentId, lot, bestBefore },
    });
    const evaluation = await reassess(client, tenantId, ctx, actorId, "label_confirmed");
    if (evaluation.status !== "NEEDS_EVIDENCE") {
      await client.query(
        `UPDATE evidence_requests SET status = 'FULFILLED', fulfilled_at = now() WHERE case_id = $1 AND status = 'OPEN'`,
        [input.caseId],
      );
    }
    return evaluation;
  });
}

// ------------------------------------------------------------- staff contact

export async function requestStaffCheck(tenantId: string, actorId: string, caseId: string) {
  await withTransaction(async (client) => {
    const ctx = await loadCaseContext(client, tenantId, caseId, true);
    if (ctx.matchStatus === "NOT_MATCHING_THIS_NOTICE") throw new CaseError("This delivery does not match the notice");
    if (ctx.responseStatus === "REVIEWED_COMPLETE") throw new CaseError("Case already reviewed");
    await client.query(
      `INSERT INTO contact_attempts (tenant_id, case_id, channel, status, initiated_by) VALUES ($1, $2, 'kitchen_link', 'SENT', $3)`,
      [tenantId, caseId, actorId],
    );
    await client.query(
      `UPDATE cases SET response_status = 'REQUESTED', version = version + 1, updated_at = now() WHERE id = $1`,
      [caseId],
    );
    await logEvent(client, { tenantId, caseId, type: "staff.check_requested", source: "manager", actorId, payload: { channel: "kitchen_link" } });
  });
}

export async function submitStaffReport(
  participant: { tenantId: string; siteId: string; actorId: string },
  input: { caseId: string; action: StaffAction; quantity: number | null; unit: string | null; note: string | null; idempotencyKey: string },
) {
  return withTransaction(async (client) => {
    const ctx = await loadCaseContext(client, participant.tenantId, input.caseId, true);
    if (ctx.siteId !== participant.siteId) throw new CaseError("Case not found");
    const inserted = await client.query(
      `INSERT INTO staff_reports (tenant_id, case_id, actor_id, reported_action, quantity_if_known, unit, note,
         confirmation_method, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'typed_and_confirmed', $8)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [participant.tenantId, input.caseId, participant.actorId, input.action, input.quantity, input.unit, input.note, input.idempotencyKey],
    );
    if (!inserted.rows[0]) return { duplicate: true };
    // A staff report never closes a case; only a manager review can.
    const next: ResponseStatus = input.action === "COULD_NOT_CHECK" ? "ESCALATED" : "STAFF_REPORTED_ACTION";
    if (ctx.responseStatus !== "REVIEWED_COMPLETE") {
      await client.query(`UPDATE cases SET response_status = $1, version = version + 1, updated_at = now() WHERE id = $2`, [next, input.caseId]);
    }
    await logEvent(client, {
      tenantId: participant.tenantId, caseId: input.caseId, type: "staff.reported", source: "kitchen",
      actorId: participant.actorId, idempotencyKey: `staff_report:${input.idempotencyKey}`,
      payload: { action: input.action, quantity: input.quantity, unit: input.unit },
    });
    return { duplicate: false };
  });
}

export async function markReviewed(tenantId: string, actorId: string, caseId: string, expectedVersion: number) {
  await withTransaction(async (client) => {
    const ctx = await loadCaseContext(client, tenantId, caseId, true);
    if (ctx.version !== expectedVersion) throw new CaseError("Case changed since you loaded it; reload and check again");
    if (ctx.matchStatus === "NEEDS_EVIDENCE") throw new CaseError("Resolve the missing evidence before closing the review");
    if (ctx.responseStatus !== "STAFF_REPORTED_ACTION") throw new CaseError("A staff report is required before review");
    await client.query(
      `UPDATE cases SET response_status = 'REVIEWED_COMPLETE', version = version + 1, updated_at = now() WHERE id = $1`,
      [caseId],
    );
    await logEvent(client, { tenantId, caseId, type: "case.reviewed_complete", source: "manager", actorId });
  });
}

// ------------------------------------------------------------------- queries

export async function getOverview(tenantId: string) {
  const pool = getPool();
  const recall = await pool.query(
    `SELECT id, source_id, source_version, source_url, title, published_at, retrieved_at, replay, review_status, normalized_scope
       FROM recall_versions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [tenantId],
  );
  const cases = await pool.query(
    `SELECT c.id, c.match_status, c.response_status, c.reason_codes, c.updated_at, s.name AS site_name, s.city,
            l.product_name_raw, l.gtin_raw, l.lot_raw, l.source_ref, l.received_at, l.quantity, l.unit
       FROM cases c JOIN sites s ON s.tenant_id = c.tenant_id AND s.id = c.site_id JOIN received_lots l ON l.id = c.received_lot_id
      WHERE c.tenant_id = $1 ORDER BY s.name`,
    [tenantId],
  );
  const counts = await pool.query(
    `SELECT (SELECT count(*)::int FROM received_lots WHERE tenant_id = $1) AS deliveries,
            (SELECT count(*)::int FROM sites WHERE tenant_id = $1) AS sites,
            (SELECT max(occurred_at) FROM event_log WHERE tenant_id = $1) AS last_event`,
    [tenantId],
  );
  return { recall: recall.rows[0] ?? null, cases: cases.rows, counts: counts.rows[0] };
}

export async function getCaseDetail(tenantId: string, caseId: string) {
  const pool = getPool();
  // A segment killed with its process stays RUNNING; close it once its deadline has clearly passed.
  await pool.query(
    `UPDATE investigation_runs SET status = 'FAILED', error_category = 'stale', finished_at = now()
      WHERE tenant_id = $1 AND case_id = $2 AND status = 'RUNNING' AND deadline_at < now() - interval '30 seconds'`,
    [tenantId, caseId],
  );
  const { rows } = await pool.query(
    `SELECT c.*, s.name AS site_name, s.city, s.contact_name,
            l.supplier, l.product_name_raw, l.gtin_raw, l.lot_raw, l.best_before_raw, l.received_at, l.quantity, l.unit, l.source_ref, l.synthetic,
            r.source_id, r.source_version, r.source_url, r.title, r.published_at, r.retrieved_at, r.replay, r.normalized_scope,
            r.raw_payload->>'conduites_a_tenir_par_le_consommateur' AS instructions,
            r.raw_payload->>'motif_rappel' AS reason
       FROM cases c JOIN sites s ON s.tenant_id = c.tenant_id AND s.id = c.site_id JOIN received_lots l ON l.id = c.received_lot_id
       JOIN recall_versions r ON r.id = c.recall_version_id
      WHERE c.tenant_id = $1 AND c.id = $2`,
    [tenantId, caseId],
  );
  if (!rows[0]) return null;
  const [documents, evidence, requests, reports, runs, events] = await Promise.all([
    pool.query(`SELECT d.id, d.mime_type, d.byte_size, d.uploaded_by, d.created_at,
                       EXISTS (SELECT 1 FROM evidence_items e WHERE e.document_id = d.id) AS confirmed,
                       x.id AS extraction_id, x.status AS extraction_status, x.fields AS extraction, x.model_id AS extraction_model,
                       x.error_category AS extraction_error, x.elapsed_ms AS extraction_ms
                  FROM documents d LEFT JOIN label_extractions x ON x.document_id = d.id
                 WHERE d.tenant_id = $1 AND d.case_id = $2 ORDER BY d.created_at`, [tenantId, caseId]),
    pool.query(`SELECT * FROM evidence_items WHERE tenant_id = $1 AND case_id = $2 ORDER BY created_at`, [tenantId, caseId]),
    pool.query(`SELECT * FROM evidence_requests WHERE tenant_id = $1 AND case_id = $2 ORDER BY created_at DESC`, [tenantId, caseId]),
    pool.query(`SELECT * FROM staff_reports WHERE tenant_id = $1 AND case_id = $2 ORDER BY reported_at DESC`, [tenantId, caseId]),
    pool.query(`SELECT r.*, COALESCE(json_agg(s ORDER BY s.step_index) FILTER (WHERE s.id IS NOT NULL), '[]') AS steps
                  FROM investigation_runs r LEFT JOIN run_steps s ON s.run_id = r.id
                 WHERE r.tenant_id = $1 AND r.case_id = $2 GROUP BY r.id ORDER BY r.started_at DESC LIMIT 5`, [tenantId, caseId]),
    pool.query(`SELECT * FROM event_log WHERE tenant_id = $1 AND case_id = $2 ORDER BY occurred_at DESC, id DESC`, [tenantId, caseId]),
  ]);
  return {
    case: rows[0],
    documents: documents.rows,
    evidence: evidence.rows,
    requests: requests.rows,
    reports: reports.rows,
    runs: runs.rows,
    events: events.rows,
  };
}

export async function getKitchenView(tenantId: string, siteId: string) {
  const pool = getPool();
  const site = await pool.query(`SELECT * FROM sites WHERE tenant_id = $1 AND id = $2`, [tenantId, siteId]);
  if (!site.rows[0]) return null;
  const cases = await pool.query(
    `SELECT c.id, c.match_status, c.response_status, l.product_name_raw, l.gtin_raw, l.lot_raw, l.best_before_raw,
            l.received_at, l.quantity, l.unit, l.source_ref,
            r.source_id, r.source_url, r.title, r.published_at, r.replay,
            r.raw_payload->>'conduites_a_tenir_par_le_consommateur' AS instructions,
            r.raw_payload->>'motif_rappel' AS reason,
            (SELECT request_text FROM evidence_requests e WHERE e.case_id = c.id AND e.status = 'OPEN') AS open_request,
            (SELECT count(*)::int FROM documents d WHERE d.case_id = c.id) AS photos,
            (SELECT json_build_object('action', reported_action, 'quantity', quantity_if_known, 'unit', unit, 'at', reported_at)
               FROM staff_reports sr WHERE sr.case_id = c.id ORDER BY reported_at DESC LIMIT 1) AS last_report
       FROM cases c JOIN received_lots l ON l.id = c.received_lot_id JOIN recall_versions r ON r.id = c.recall_version_id
      WHERE c.tenant_id = $1 AND c.site_id = $2 AND c.match_status <> 'NOT_MATCHING_THIS_NOTICE'
        AND (c.response_status <> 'NOT_REQUESTED' OR EXISTS (SELECT 1 FROM evidence_requests e WHERE e.case_id = c.id AND e.status = 'OPEN'))
      ORDER BY l.received_at`,
    [tenantId, siteId],
  );
  return { site: site.rows[0], cases: cases.rows };
}

export async function getDocument(tenantId: string, documentId: string) {
  const { rows } = await getPool().query(
    `SELECT mime_type, content FROM documents WHERE tenant_id = $1 AND id = $2`,
    [tenantId, documentId],
  );
  return rows[0] as { mime_type: string; content: Buffer } | undefined;
}
