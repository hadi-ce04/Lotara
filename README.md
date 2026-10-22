# Lotara

Hackathon prototype (Paris AI Innovate, October 2026). Lotara helps the manager of several nursery kitchens turn a
product-recall notice into a targeted, evidence-backed response. Plan and rationale: [Blueprint.md](Blueprint.md).

**This is a prototype, not a food-safety system.** It does not certify food as safe and does not verify that stock was
removed. The notice is real but replayed; kitchens, staff and deliveries are synthetic.

## What works

- **Real notice, replayed.** RappelConso [2026-04-0331](https://rappel.conso.gouv.fr/fiche-rappel/22174/interne)
  (Les Vergers Gourmands compote bio) is saved in `fixtures/development/` with publication and retrieval times. The
  UI labels it as a historical replay.
- **Deterministic three-way matching** (`lib/matching/evaluate.ts`) on the notice's (GTIN, lot, best-before) entries:
  - Les Lilas: **recorded match**.
  - Belleville: **not matching this notice**, because its lot K101 is listed only under the other GTIN. A name-only
    matcher gets this case wrong.
  - Montreuil: **needs evidence**, because no lot was recorded at delivery.
- **AI investigator** (`lib/ai/investigate.ts`). A bounded tool loop on one case, calling the Anthropic API directly:
  - It uses seven allowlisted, case-scoped tools with Zod-validated inputs: `get_recall_scope`,
    `get_delivery_record`, `get_case_evidence`, `extract_label`, `evaluate_match`, `request_evidence`,
    `finish_investigation`.
  - Each segment is limited to 8 tool calls, 8 model turns and 120 s.
  - The deterministic evaluator is the authority. `finish_investigation` is rejected if its conclusion differs from
    the evaluator, if it cites refs that no tool returned, or if the summary says "safe".
  - Every model turn and tool step is persisted with its tokens. The run shows an estimated cost.
  - A segment resumes automatically after a label upload or a confirmation (at most 4 automatic segments per case
    per 15 minutes; at most 5 photos per case).
- **Rule-based check (no AI).** The fallback when no API key is set. It is labelled as such in the UI.
- **Label photo upload** from the kitchen link (JPEG/PNG up to 4 MB), stored privately in PostgreSQL.
  - AI transcription (`lib/ai/extract.ts`) is shown as *unconfirmed* and flags ambiguous characters (O/0, I/1…).
    Confirmation inputs are never pre-filled: the person types what they read, and the record notes whether it
    agreed with the AI transcription.
  - A person confirms the values, which triggers deterministic reassessment. Contradictory evidence reopens review.
- **Typed staff report** with explicit confirmation, deduplicated by a per-form idempotency key. Only the manager can
  mark *reviewed complete*, and only after evidence is resolved and a staff report exists.
- **Event history.** Each state change is written in the same transaction as its event, with optimistic version
  checks.

**Not implemented / deferred:**

- Voice (ElevenLabs).
- Supabase storage (photos live in PostgreSQL).
- Vercel AI Gateway.
- CSV import.
- Unattended background workers and live source polling.

## Architecture

- **App:** Next.js 16 (App Router, server actions), TypeScript, Tailwind v4. Built from the `Dockerfile` as a
  standalone container running as a non-root user on **port 8080** on **Aiven Runtime**.
- **Data:** **Aiven for PostgreSQL**, tables in the `lotara` schema (`db/migrations`). TLS uses certificate
  verification against the project CA, and `sslmode` URL parameters are ignored.
- **AI:** `@anthropic-ai/sdk` calling the Anthropic API directly. The model defaults to `claude-opus-5-5`
  (`ANTHROPIC_MODEL`), and effort to `medium` (`ANTHROPIC_EFFORT`). The server-side refusal fallback is enabled, and
  the model that actually answered is recorded on each run.
- **Auth:** one demo manager password (scrypt hash) with an HTTP-only session. Kitchens use signed, site-scoped
  participant links (valid 7 days).

## Local setup

1. `npm ci`
2. Create `.env.local` (git-ignored):
   - `AIVEN_DATABASE_URL`: the Aiven service URI;
   - `AIVEN_CA_CERT_PATH=certs/aiven-ca.pem`: the project CA saved to `certs/`, which is also ignored;
   - `ANTHROPIC_API_KEY`: optional; without it, only the rule-based check runs.
3. `npm run setup:secrets` prompts for the demo admin password (not echoed). It writes `DEMO_ADMIN_PASSWORD_HASH`
   (format `scrypt:<salt>:<hash>`, with no `$`), `SESSION_SECRET` and `PARTICIPANT_TOKEN_SECRET` to `.env.local`.
   It also writes the raw Runtime values to the ignored `secrets/aiven-runtime-secrets.txt`. Flags:
   - `-- --upgrade-hash` converts a legacy `scrypt$…` hash (same password, no prompt);
   - `-- --export` only rewrites the export file;
   - `-- --rotate` also regenerates the session and participant secrets.
4. `npm run db:check` (`SELECT 1` over verified TLS), then `npm run db:migrate`.
5. `npm run ai:smoke` makes one small text call and one vision call on the synthetic label. It is billed.
6. `npm run dev`, sign in, then click **Reset demo**.

## Tests

- `npm test`: unit tests plus the database flow test, using the isolated `itest` tenant and `.env.local`. It makes
  no paid AI calls. `RUN_AI_TESTS=1 npm test` also runs the real, billed AI flow test.
- `npm run test:e2e`: a Playwright run of the full journey against a local dev server. It uses the isolated `e2e`
  tenant and a throwaway password, with AI disabled. `E2E_AI=1` uses the real model.
  - To test a deployed URL, set `E2E_BASE_URL` and `E2E_ADMIN_PASSWORD`. The test refuses to reset that server's
    data unless `E2E_ALLOW_RESET=1`.

## Deploying to Aiven Runtime

Connect the GitHub repository and build with the `Dockerfile`, exposing port 8080. Set these runtime variables. Copy
the raw values from `secrets/aiven-runtime-secrets.txt`, with no quotes:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Provided by the service integration with the PostgreSQL service (or set `AIVEN_DATABASE_URL` as a secret) |
| `AIVEN_CA_CERT_BASE64` | Base64 of the project CA PEM |
| `ANTHROPIC_API_KEY` | Secret. Without it, AI actions report "unavailable" and the rule-based check still works |
| `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` | Optional (defaults `claude-opus-5-5`, `medium`) |
| `DEMO_ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `PARTICIPANT_TOKEN_SECRET` | Secrets, from `npm run setup:secrets` |
| `NODE_ENV`, `NEXT_TELEMETRY_DISABLED` | `production`, `1` (already set in the image) |

**Pushing does not deploy.** After pushing, choose **Deploy latest commit** explicitly. Then open `GET /api/health`:
- `release` should match `lib/release.ts`;
- `database.ok` should be true;
- `config` reports only categories and booleans (password hash `ok`, secrets present, API key present), never
  values.

## Evaluation

`npm run eval` runs the benchmark: a name-only baseline, the structured matcher, and the full flow on synthetic
cases. Results are written to [docs/RESULTS.md](docs/RESULTS.md). The results are synthetic prototype measurements,
not real-world performance.

## Docs

- [docs/demo-script.md](docs/demo-script.md): 150-second demo with fallback and pre-demo checklist
- [docs/pitch-slide.md](docs/pitch-slide.md): one-slide pitch
- [docs/lovable-prompt.md](docs/lovable-prompt.md): UI design prompt and porting plan

The demo label images in `public/demo/` are synthetic (`scripts/make-demo-label.py`).
