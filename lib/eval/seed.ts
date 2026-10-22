import snapshot from "@/fixtures/development/recall-2026-04-0331.json";
import { clearTenant, logEvent } from "../cases";
import { withTransaction } from "../db";
import { evaluateMatch } from "../matching/evaluate";
import { normalizeGtin } from "../matching/normalize";
import { adaptRappelConso, type RappelConsoRecord } from "../recalls/adapter";
import type { EvalCase, EvalSite } from "./data";

// Seeds an isolated evaluation tenant, modelled on resetDemo in lib/cases.ts:
// same saved notice, the evaluation register, and the same candidate selection
// (listed GTIN, or no usable GTIN with the brand in the product name).

export const EVAL_TENANT = "eval";
const PROTECTED = new Set(["demo", "e2e"]);

export type SeededCase = { evalId: string; receivedLotId: string; caseId: string | null; status: string | null };

function assertEvalTenant(tenantId: string) {
  if (PROTECTED.has(tenantId) || !tenantId.startsWith("eval")) throw new Error("Refusing to seed a non-evaluation tenant");
}

export async function clearEvalTenant(tenantId: string) {
  assertEvalTenant(tenantId);
  await withTransaction((client) => clearTenant(client, tenantId));
}

export async function seedEvalTenant(tenantId: string, actorId: string, sites: EvalSite[], cases: EvalCase[]): Promise<Map<string, SeededCase>> {
  assertEvalTenant(tenantId);
  const record = snapshot.records[0] as unknown as RappelConsoRecord;
  const notice = adaptRappelConso(record);
  return withTransaction(async (client) => {
    await clearTenant(client, tenantId);
    for (const s of sites) {
      await client.query(
        `INSERT INTO sites (id, tenant_id, name, city, contact_name, synthetic) VALUES ($1, $2, $3, $4, $5, true)`,
        [s.id, tenantId, s.name, s.city, s.contactName],
      );
    }
    const { rows: [recall] } = await client.query(
      `INSERT INTO recall_versions (tenant_id, source, source_id, source_version, source_url, title, raw_payload,
         normalized_scope, published_at, retrieved_at, content_hash, review_status, replay)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'REVIEWED_FOR_DEMO', true) RETURNING id`,
      [tenantId, notice.source, notice.sourceId, notice.sourceVersion, notice.sourceUrl, notice.title,
        JSON.stringify(record), JSON.stringify(notice.scope), notice.publishedAt, snapshot.retrieved_at, notice.contentHash],
    );
    const seeded = new Map<string, SeededCase>();
    for (const c of cases) {
      const gtin = normalizeGtin(c.gtin);
      const { rows: [lot] } = await client.query(
        `INSERT INTO received_lots (tenant_id, site_id, supplier, product_name_raw, gtin_raw, gtin_normalized, lot_raw,
           best_before_raw, received_at, quantity, unit, source_ref, synthetic)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true) RETURNING id`,
        [tenantId, c.site, "Grossiste Évaluation (synthetic)", c.productName, c.gtin, gtin.ok ? gtin.gtin14 : null, c.lot,
          c.bestBefore, c.receivedAt, 24, "gourdes", c.ref],
      );
      seeded.set(c.id, { evalId: c.id, receivedLotId: lot.id, caseId: null, status: null });
    }
    await logEvent(client, { tenantId, caseId: null, type: "eval.seeded", source: "evaluation", actorId, payload: { notice: notice.sourceId, cases: cases.length } });

    // Candidate selection and assessment, as in assessRecall.
    const scope = notice.scope;
    const gtins = [...new Set(scope.entries.map((e) => e.gtin14))];
    const { rows: lots } = await client.query(
      `SELECT id, site_id, gtin_raw, lot_raw, best_before_raw FROM received_lots
        WHERE tenant_id = $1 AND (gtin_normalized = ANY($2) OR (gtin_normalized IS NULL AND product_name_raw ILIKE '%' || $3 || '%'))
        ORDER BY site_id, received_at`,
      [tenantId, gtins, scope.brand],
    );
    const byLot = new Map([...seeded.values()].map((s) => [s.receivedLotId, s]));
    for (const lot of lots) {
      const evaluation = evaluateMatch(scope, { gtinRaw: lot.gtin_raw, lotRaw: lot.lot_raw, bestBeforeRaw: lot.best_before_raw });
      const { rows: [inserted] } = await client.query(
        `INSERT INTO cases (tenant_id, recall_version_id, site_id, received_lot_id, match_status, response_status, reason_codes, evaluation)
         VALUES ($1, $2, $3, $4, $5, 'NOT_REQUESTED', $6, $7) RETURNING id`,
        [tenantId, recall.id, lot.site_id, lot.id, evaluation.status, evaluation.reasons, JSON.stringify(evaluation)],
      );
      await logEvent(client, { tenantId, caseId: inserted.id, type: "case.assessed", source: "rules", actorId, payload: { status: evaluation.status, reasons: evaluation.reasons } });
      const s = byLot.get(lot.id)!;
      s.caseId = inserted.id;
      s.status = evaluation.status;
    }
    return seeded;
  });
}
