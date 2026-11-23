-- Bellia, esquema SQLite v3. Ejecutar solamente sobre una base nueva y vacía.
-- Ejemplo: sqlite3 -bail /ruta/persistente/bellia.db < server/db/schema.sqlite.sql
BEGIN IMMEDIATE;

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
-- Bellia: una fila por mesa y fecha; el detalle no identifica la mesa.
CREATE TABLE IF NOT EXISTS quality_table_days (
  table_name TEXT NOT NULL CHECK (length(trim(table_name)) BETWEEN 1 AND 100 AND table_name = trim(table_name)),
  report_date TEXT NOT NULL CHECK (length(report_date) = 10 AND date(report_date, '+0 days') IS NOT NULL AND date(report_date, '+0 days') = report_date),
  staff INTEGER NOT NULL CHECK (staff >= 1),
  hours REAL NOT NULL CHECK (hours >= 8 AND hours <= 24),
  approved INTEGER NOT NULL CHECK (approved >= 0),
  blocked INTEGER NOT NULL CHECK (blocked >= 0),
  detail_provided INTEGER NOT NULL CHECK (detail_provided IN (0, 1)),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  PRIMARY KEY (table_name, report_date),
  CHECK ((approved + blocked) <= 450359962737049)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_quality_table_days_date ON quality_table_days(report_date);
CREATE TABLE IF NOT EXISTS quality_piece_details (
  report_date TEXT NOT NULL CHECK (length(report_date) = 10 AND date(report_date, '+0 days') IS NOT NULL AND date(report_date, '+0 days') = report_date),
  piece TEXT NOT NULL CHECK (length(trim(piece)) BETWEEN 1 AND 100 AND piece = trim(piece)),
  broken_without_piece INTEGER NOT NULL CHECK (broken_without_piece >= 0),
  fissure INTEGER NOT NULL CHECK (fissure >= 0),
  sharp_burr INTEGER NOT NULL CHECK (sharp_burr >= 0),
  stain INTEGER NOT NULL CHECK (stain >= 0),
  other INTEGER NOT NULL CHECK (other >= 0),
  broken_with_piece INTEGER NOT NULL CHECK (broken_with_piece >= 0),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  PRIMARY KEY (report_date, piece)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_quality_piece_details_date ON quality_piece_details(report_date);

PRAGMA user_version = 3;
COMMIT;
