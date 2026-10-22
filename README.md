# Lotara

Hackathon prototype (Paris AI Innovate, October 2026). Lotara helps a manager of several nursery kitchens turn a
product-recall notice into a targeted, evidence-backed response. See [Blueprint.md](Blueprint.md) for the plan.

**Status: reduced MVP.** It is not a validated food-safety system. It does not certify food as safe, and it does not
verify that stock was removed.

## What works today

- **Real notice, replayed.** RappelConso notice [2026-04-0331](https://rappel.conso.gouv.fr/fiche-rappel/22174/interne)
  (Les Vergers Gourmands compote bio) is saved in `fixtures/development/` with its retrieval time. It is replayed as
  history, not presented as a new alert.
- **Three synthetic kitchens.** Deliveries are fictional and labelled synthetic.
- **Deterministic three-way matching** (`lib/matching/evaluate.ts`) on the notice's (GTIN, lot, best-before) entries:
  - Les Lilas: recorded match.
  - Belleville: not matching this notice. Its lot is listed only under the notice's other GTIN.
  - Montreuil: needs evidence, because no lot was recorded at delivery.
- **Bounded rule-based investigation.** At most 6 persisted steps. It creates one targeted request for missing evidence.
- **Label photo upload** from the kitchen page, stored privately in PostgreSQL. A person reads the photo and confirms
  the lot and best-before date, which triggers reassessment. Contradictory evidence reopens review.
- **Typed staff report.** The participant confirms the report and it is deduplicated. Only a manager can mark
  *reviewed complete*, and only once the evidence is resolved.
- **Event history.** Every state change is written in the same transaction as its event, with optimistic version checks.

Deferred: AI Gateway/model-assisted label extraction, ElevenLabs voice, Supabase Storage, CSV import, evaluation runs.

## Stack

Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4, `pg` against **Aiven for PostgreSQL** with TLS
certificate verification. Tables live in the `lotara` schema of the existing database. Deployed as a container to
**Aiven Runtime**.

## Local setup

1. `npm ci`
2. Put the Aiven service URI in `.env.local` as `AIVEN_DATABASE_URL=...`. Save the project CA certificate to
   `certs/aiven-ca.pem`, with `AIVEN_CA_CERT_PATH=certs/aiven-ca.pem`. Both files are git-ignored. See `.env.example`.
3. `npm run setup:secrets` prompts for a demo admin password (not echoed). It writes the password hash plus the session
   and participant secrets into `.env.local`.
4. `npm run db:check` runs `SELECT 1` over verified TLS. `npm run db:migrate` applies `db/migrations`.
5. `npm run dev`, sign in, then click **Reset demo**.

## Tests

- `npm test` runs unit tests (matching, adapter) and the database flow test. The flow test uses an isolated `itest`
  tenant and needs `.env.local`.
- `npm run test:e2e` runs a Playwright browser test of the whole journey. **It resets the `demo` tenant.**
  - It signs in with a throwaway password generated for each run.
  - To test a running container instead, set `E2E_BASE_URL` and `E2E_ADMIN_PASSWORD`.

## Deploying to Aiven Runtime

The `Dockerfile` builds Next.js standalone output and runs it as a non-root user on **port 8080**. Runtime secrets:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Provided by connecting the `lotara-pg` service to the app. Or set `AIVEN_DATABASE_URL` as a secret. |
| `AIVEN_CA_CERT_BASE64` | Base64 of the project CA PEM (`base64 -w0 certs/aiven-ca.pem`) |
| `DEMO_ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `PARTICIPANT_TOKEN_SECRET` | From `.env.local` after `npm run setup:secrets` |

Pushing does not redeploy. After pushing, choose **Actions → Deploy latest commit**. `GET /api/health` returns
`{"status":"ok"}` when the database is reachable.

The demo label images in `public/demo/` are synthetic (`scripts/make-demo-label.py`).
