-- ─────────────────────────────────────────────────────────────────────────────
-- Vaccine Module Migration
-- Run once in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Vaccine inventory / catalog (per farm) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS vaccines (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  vaccine_type      TEXT,                          -- e.g. "Newcastle Disease", "Hog Cholera"
  species           TEXT        NOT NULL DEFAULT 'both', -- 'chicken' | 'pig' | 'both'
  manufacturer      TEXT,
  stock_quantity    NUMERIC     NOT NULL DEFAULT 0,
  unit              TEXT        NOT NULL DEFAULT 'dose', -- 'dose' | 'ml' | 'vial'
  dose_per_animal   NUMERIC,                       -- recommended dose per animal
  withdrawal_days   INT         NOT NULL DEFAULT 0, -- days before safe for slaughter/sale
  reorder_threshold NUMERIC     DEFAULT 10,         -- alert when stock falls below this
  storage_temp      TEXT,                          -- e.g. "2–8 °C"
  route             TEXT        DEFAULT 'injection', -- 'injection'|'oral'|'spray'|'eye_drop'
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Vaccination records (actual events) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaccination_records (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id             UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  batch_id            UUID        REFERENCES batches(id)   ON DELETE SET NULL,
  housing_id          UUID        REFERENCES housings(id)  ON DELETE SET NULL,
  vaccine_id          UUID        REFERENCES vaccines(id)  ON DELETE SET NULL,
  vaccine_name        TEXT        NOT NULL,         -- denormalised for audit trail
  administered_date   DATE        NOT NULL,
  administered_by     TEXT,                         -- user id or display name
  animals_vaccinated  INT,
  dose_per_animal     NUMERIC,
  total_dose_used     NUMERIC,                      -- auto: animals_vaccinated * dose_per_animal
  unit                TEXT        DEFAULT 'dose',
  lot_number          TEXT,                         -- traceability / regulatory
  expiry_date         DATE,                         -- expiry of the vaccine lot used
  withdrawal_days     INT         DEFAULT 0,
  withdrawal_end_date DATE,                         -- auto: administered_date + withdrawal_days
  route               TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Vaccination schedule (upcoming / recurring) ────────────────────────────
CREATE TABLE IF NOT EXISTS vaccination_schedules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID        NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  batch_id        UUID        REFERENCES batches(id)   ON DELETE SET NULL,
  housing_id      UUID        REFERENCES housings(id)  ON DELETE SET NULL,
  vaccine_id      UUID        REFERENCES vaccines(id)  ON DELETE SET NULL,
  vaccine_name    TEXT        NOT NULL,
  scheduled_date  DATE        NOT NULL,
  interval_days   INT,                              -- NULL = one-time; >0 = recurring
  status          TEXT        NOT NULL DEFAULT 'pending', -- 'pending'|'completed'|'overdue'|'cancelled'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vaccines_farm          ON vaccines(farm_id);
CREATE INDEX IF NOT EXISTS idx_vacc_records_farm      ON vaccination_records(farm_id);
CREATE INDEX IF NOT EXISTS idx_vacc_records_batch     ON vaccination_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_vacc_records_date      ON vaccination_records(administered_date DESC);
CREATE INDEX IF NOT EXISTS idx_vacc_schedule_farm     ON vaccination_schedules(farm_id);
CREATE INDEX IF NOT EXISTS idx_vacc_schedule_date     ON vaccination_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vacc_schedule_status   ON vaccination_schedules(status);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE vaccines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_schedules ENABLE ROW LEVEL SECURITY;

-- Workers see their assigned farm; farm_admins see all their managed farms
CREATE POLICY "vaccines_farm_access"
  ON vaccines FOR ALL TO authenticated
  USING (
    farm_id IN (SELECT farm_id FROM users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM farm_admin_farms WHERE admin_user_id = auth.uid()::text)
  );

CREATE POLICY "vaccination_records_farm_access"
  ON vaccination_records FOR ALL TO authenticated
  USING (
    farm_id IN (SELECT farm_id FROM users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM farm_admin_farms WHERE admin_user_id = auth.uid()::text)
  );

CREATE POLICY "vaccination_schedules_farm_access"
  ON vaccination_schedules FOR ALL TO authenticated
  USING (
    farm_id IN (SELECT farm_id FROM users WHERE id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM farm_admin_farms WHERE admin_user_id = auth.uid()::text)
  );
