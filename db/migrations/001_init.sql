-- Lotara core schema. Lives in its own schema inside the existing Aiven database.
CREATE SCHEMA IF NOT EXISTS lotara;
SET search_path TO lotara, public;

CREATE TABLE sites (
  tenant_id     text NOT NULL,
  id            text NOT NULL,
  name          text NOT NULL,
  city          text NOT NULL,
  contact_name  text NOT NULL,
  synthetic     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE recall_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text NOT NULL,
  source            text NOT NULL,
  source_id         text NOT NULL,
  source_version    integer NOT NULL,
  source_url        text NOT NULL,
  title             text NOT NULL,
  raw_payload       jsonb NOT NULL,
  normalized_scope  jsonb NOT NULL,
  published_at      timestamptz NOT NULL,
  retrieved_at      timestamptz NOT NULL,
  content_hash      text NOT NULL,
  review_status     text NOT NULL,
  replay            boolean NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source, source_id, source_version)
);

CREATE TABLE received_lots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text NOT NULL,
  site_id           text NOT NULL,
  supplier          text NOT NULL,
  product_name_raw  text NOT NULL,
  gtin_raw          text,
  gtin_normalized   text,
  lot_raw           text,
  best_before_raw   text,
  received_at       timestamptz NOT NULL,
  quantity          numeric,
  unit              text,
  source_ref        text NOT NULL,
  synthetic         boolean NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id)
);
CREATE INDEX received_lots_gtin_idx ON received_lots (tenant_id, gtin_normalized);
CREATE INDEX received_lots_site_idx ON received_lots (tenant_id, site_id);

CREATE TABLE cases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          text NOT NULL,
  recall_version_id  uuid NOT NULL REFERENCES recall_versions(id),
  site_id            text NOT NULL,
  received_lot_id    uuid NOT NULL REFERENCES received_lots(id),
  match_status       text NOT NULL CHECK (match_status IN ('RECORDED_MATCH', 'NOT_MATCHING_THIS_NOTICE', 'NEEDS_EVIDENCE')),
  response_status    text NOT NULL CHECK (response_status IN ('NOT_REQUESTED', 'REQUESTED', 'STAFF_REPORTED_ACTION', 'REVIEWED_COMPLETE', 'ESCALATED')),
  reason_codes       text[] NOT NULL,
  evaluation         jsonb NOT NULL,
  version            integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id),
  UNIQUE (tenant_id, recall_version_id, site_id, received_lot_id)
);
CREATE INDEX cases_status_idx ON cases (tenant_id, recall_version_id, match_status);

CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  site_id      text NOT NULL,
  case_id      uuid REFERENCES cases(id),
  mime_type    text NOT NULL,
  byte_size    integer NOT NULL,
  sha256       text NOT NULL,
  content      bytea NOT NULL,
  uploaded_by  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id)
);

CREATE TABLE evidence_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text NOT NULL,
  case_id           uuid NOT NULL REFERENCES cases(id),
  requested_fields  text[] NOT NULL,
  request_text      text NOT NULL,
  status            text NOT NULL CHECK (status IN ('OPEN', 'FULFILLED')),
  created_by        text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  fulfilled_at      timestamptz
);
-- At most one open request per case.
CREATE UNIQUE INDEX evidence_requests_open_idx ON evidence_requests (case_id) WHERE status = 'OPEN';

CREATE TABLE evidence_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          text NOT NULL,
  case_id            uuid NOT NULL REFERENCES cases(id),
  document_id        uuid NOT NULL REFERENCES documents(id),
  field_name         text NOT NULL CHECK (field_name IN ('lot', 'best_before', 'gtin')),
  raw_value          text NOT NULL,
  extraction_method  text NOT NULL,
  confirmed_by       text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE investigation_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text NOT NULL,
  case_id      uuid NOT NULL REFERENCES cases(id),
  status       text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'NEEDS_EVIDENCE', 'FAILED')),
  method       text NOT NULL,
  step_count   integer NOT NULL DEFAULT 0,
  summary      text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
-- At most one active investigation per case.
CREATE UNIQUE INDEX investigation_runs_active_idx ON investigation_runs (case_id) WHERE status = 'RUNNING';

CREATE TABLE run_steps (
  id          bigserial PRIMARY KEY,
  run_id      uuid NOT NULL REFERENCES investigation_runs(id),
  step_index  integer NOT NULL,
  tool_name   text NOT NULL,
  input       jsonb NOT NULL,
  output      jsonb NOT NULL,
  elapsed_ms  integer NOT NULL,
  status      text NOT NULL,
  UNIQUE (run_id, step_index)
);

CREATE TABLE contact_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  case_id       uuid NOT NULL REFERENCES cases(id),
  channel       text NOT NULL,
  status        text NOT NULL,
  initiated_by  text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_reports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            text NOT NULL,
  case_id              uuid NOT NULL REFERENCES cases(id),
  actor_id             text NOT NULL,
  reported_action      text NOT NULL CHECK (reported_action IN ('SET_ASIDE', 'NONE_FOUND', 'COULD_NOT_CHECK')),
  quantity_if_known    numeric,
  unit                 text,
  note                 text,
  confirmation_method  text NOT NULL,
  idempotency_key      text NOT NULL UNIQUE,
  reported_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_log (
  id               bigserial PRIMARY KEY,
  tenant_id        text NOT NULL,
  case_id          uuid REFERENCES cases(id),
  event_type       text NOT NULL,
  source           text NOT NULL,
  actor_id         text NOT NULL,
  idempotency_key  text UNIQUE,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX event_log_case_idx ON event_log (case_id, occurred_at);
