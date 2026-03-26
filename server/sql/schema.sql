CREATE TABLE IF NOT EXISTS scans (
  id BIGSERIAL PRIMARY KEY,
  value TEXT NOT NULL,
  type VARCHAR(20) NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_value_type ON scans (value, type);
