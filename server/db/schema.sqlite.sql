CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quality_records (
  id TEXT PRIMARY KEY,
  record_key TEXT NOT NULL UNIQUE,
  report_date TEXT NOT NULL,
  row_order INTEGER NOT NULL,
  shift TEXT NOT NULL,
  lot TEXT NOT NULL,
  product TEXT NOT NULL,
  received REAL NOT NULL,
  pending_start REAL NOT NULL,
  inspected REAL NOT NULL,
  approved REAL NOT NULL,
  rejected REAL NOT NULL,
  waste REAL NOT NULL,
  pending_end REAL NOT NULL,
  staff REAL NOT NULL,
  hours_per_person REAL NOT NULL,
  observations TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL,
  source_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quality_incidents (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES quality_records(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  lot TEXT NOT NULL,
  product TEXT NOT NULL,
  defect TEXT NOT NULL,
  affected REAL NOT NULL,
  action TEXT NOT NULL,
  observation TEXT NOT NULL,
  responsible TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quality_records_date ON quality_records(report_date);
CREATE INDEX IF NOT EXISTS idx_quality_incidents_date ON quality_incidents(report_date);
