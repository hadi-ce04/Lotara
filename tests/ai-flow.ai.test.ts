import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAiInvestigation } from "../lib/ai/investigate";
import { clearTenant, confirmLabelReading, getCaseDetail, getOverview, resetDemo, uploadLabelPhoto } from "../lib/cases";
import { getPool, withTransaction } from "../lib/db";

// Real model calls (costs money): run with RUN_AI_TESTS=1. Isolated tenant.
const TENANT = "itest-ai";
const ACTOR = "itest-manager";
const enabled = process.env.RUN_AI_TESTS === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

const montreuil = async () => (await getOverview(TENANT)).cases.find((c) => c.site_name.includes("Montreuil"))!;
const tools = (detail: NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>) =>
  detail.runs[0].steps.filter((s: { kind: string }) => s.kind === "tool").map((s: { tool_name: string }) => s.tool_name);

describe.skipIf(!enabled)("AI investigator (real API)", () => {
  beforeAll(() => resetDemo(TENANT, ACTOR), 60_000);
  afterAll(async () => {
    await withTransaction((client) => clearTenant(client, TENANT));
    await getPool().end();
  });

  it("requests the missing label, extracts an uploaded photo without confirming it, then concludes after human confirmation", async () => {
    const c = await montreuil();

    const first = await runAiInvestigation(TENANT, c.id, ACTOR, "manual");
    let detail = (await getCaseDetail(TENANT, c.id))!;
    console.log("segment 1:", first.status, first.errorCategory, tools(detail));
    expect(first.status).toBe("NEEDS_EVIDENCE");
    expect(detail.requests.filter((r) => r.status === "OPEN")).toHaveLength(1);
    expect(tools(detail)).toContain("evaluate_match");

    const png = new File([readFileSync("public/demo/synthetic-label-K100.png")], "label.png", { type: "image/png" });
    const docId = await uploadLabelPhoto({ tenantId: TENANT, actorId: "participant:montreuil", siteId: "montreuil" }, c.id, png);
    const second = await runAiInvestigation(TENANT, c.id, ACTOR, "evidence_uploaded");
    detail = (await getCaseDetail(TENANT, c.id))!;
    console.log("segment 2:", second.status, second.errorCategory, tools(detail));
    expect(tools(detail)).toContain("extract_label");
    expect(detail.case.match_status).toBe("NEEDS_EVIDENCE"); // unconfirmed extraction cannot change status
    const { rows: [x] } = await getPool().query(`SELECT fields FROM lotara.label_extractions WHERE document_id = $1`, [docId]);
    expect(x.fields.lot_text).toBe("K100");

    await confirmLabelReading(TENANT, ACTOR, { caseId: c.id, documentId: docId, expectedVersion: detail.case.version, lot: "K100", bestBefore: "10/12/2026" });
    const third = await runAiInvestigation(TENANT, c.id, ACTOR, "evidence_confirmed");
    detail = (await getCaseDetail(TENANT, c.id))!;
    console.log("segment 3:", third.status, third.errorCategory, third.summary);
    expect(third.status).toBe("COMPLETED");
    expect(detail.case.match_status).toBe("RECORDED_MATCH");
    expect(third.summary).toMatch(/delivery:SYN-DL-0419|notice:2026-04-0331/);
    for (const run of detail.runs) console.log(run.status, run.usage, `$${Number(run.cost_usd_est).toFixed(4)}`);
  }, 400_000);
});
