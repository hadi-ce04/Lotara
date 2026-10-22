-- AI investigation and label extraction. Additive only.
SET search_path TO lotara, public;

ALTER TABLE investigation_runs
  ADD COLUMN model_id        text,
  ADD COLUMN prompt_version  text,
  ADD COLUMN trigger         text,
  ADD COLUMN usage           jsonb,
  ADD COLUMN cost_usd_est    numeric,
  ADD COLUMN error_category  text,
  ADD COLUMN deadline_at     timestamptz;

ALTER TABLE run_steps
  ADD COLUMN kind   text NOT NULL DEFAULT 'tool' CHECK (kind IN ('tool', 'model')),
  ADD COLUMN usage  jsonb;

-- Raw model transcription of one label photo. Never treated as confirmed evidence.
CREATE TABLE label_extractions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL,
  document_id    uuid NOT NULL UNIQUE REFERENCES documents(id),
  status         text NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
  model_id       text,
  fields         jsonb,
  error_category text,
  usage          jsonb,
  elapsed_ms     integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Links a human-confirmed value to the extraction it was checked against.
ALTER TABLE evidence_items ADD COLUMN extraction_id uuid REFERENCES label_extractions(id);
