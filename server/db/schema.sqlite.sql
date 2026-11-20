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
  expires_at TEXT NOT NULL,
  last_activity_at TEXT
);
-- Calidad V2: una fila por operario y fecha, sin identificadores de caja.
CREATE TABLE IF NOT EXISTS quality_workdays (
  operator_id TEXT NOT NULL CHECK (length(trim(operator_id)) BETWEEN 1 AND 100 AND operator_id = trim(operator_id)),
  report_date TEXT NOT NULL CHECK (length(report_date) = 10 AND date(report_date, '+0 days') IS NOT NULL AND date(report_date, '+0 days') = report_date),
  hours REAL NOT NULL CHECK (hours > 0 AND hours <= 24),
  approved INTEGER NOT NULL CHECK (approved >= 0),
  blocked INTEGER NOT NULL CHECK (blocked >= 0),
  tolerated INTEGER NOT NULL CHECK (tolerated >= 0),
  minor INTEGER NOT NULL CHECK (minor >= 0),
  major INTEGER NOT NULL CHECK (major >= 0),
  critical INTEGER NOT NULL CHECK (critical >= 0),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  PRIMARY KEY (operator_id, report_date),
  CHECK ((approved + blocked) <= 450359962737049),
  CHECK (tolerated + minor + major + critical BETWEEN blocked AND blocked * 20)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_quality_workdays_date ON quality_workdays(report_date);
