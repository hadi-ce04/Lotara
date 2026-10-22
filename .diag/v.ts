import { getPool } from "../lib/db";
(async () => { const p = getPool();
const r = await p.query("SELECT event_type, occurred_at FROM event_log WHERE tenant_id='video' ORDER BY occurred_at DESC LIMIT 6");
console.table(r.rows.map(x=>({e:x.event_type,t:x.occurred_at.toISOString().slice(11,19)})));
const q = await p.query("SELECT status, error_category, step_count, started_at FROM investigation_runs WHERE tenant_id='video' ORDER BY started_at DESC LIMIT 3"); console.table(q.rows.map(x=>({...x, started_at:x.started_at.toISOString().slice(11,19)})));
await p.end(); })();
