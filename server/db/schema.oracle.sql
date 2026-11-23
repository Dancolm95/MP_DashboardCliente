-- Bellia: ejecutar una vez en un esquema Oracle nuevo y vacío.
-- Crea la estructura; npm run seed crea el administrador y la aplicación importa el Excel.
-- No migra las tablas del dashboard anterior.

CREATE TABLE users (
  id VARCHAR2(36 CHAR) PRIMARY KEY,
  email VARCHAR2(255 CHAR) NOT NULL UNIQUE,
  name VARCHAR2(100 CHAR) NOT NULL,
  password_hash VARCHAR2(300 CHAR) NOT NULL,
  role VARCHAR2(10 CHAR) NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at VARCHAR2(30 CHAR) NOT NULL
);

CREATE TABLE sessions (
  token_hash VARCHAR2(64 CHAR) PRIMARY KEY,
  user_id VARCHAR2(36 CHAR) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at VARCHAR2(30 CHAR) NOT NULL,
  last_activity_at VARCHAR2(30 CHAR)
);

-- Una jornada por fecha y mesa; el detalle de fallas no identifica la mesa.
CREATE TABLE quality_table_days (
  table_name VARCHAR2(100 CHAR) NOT NULL,
  report_date VARCHAR2(10 CHAR) NOT NULL
    CHECK (REGEXP_LIKE(report_date, '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')),
  staff NUMBER(16,0) NOT NULL CHECK (staff >= 1),
  hours BINARY_DOUBLE NOT NULL CHECK (hours >= 8 AND hours <= 24),
  approved NUMBER(16,0) NOT NULL CHECK (approved >= 0),
  blocked NUMBER(16,0) NOT NULL CHECK (blocked >= 0),
  detail_provided NUMBER(1,0) NOT NULL CHECK (detail_provided IN (0, 1)),
  uploaded_by VARCHAR2(36 CHAR) NOT NULL REFERENCES users(id),
  uploaded_at VARCHAR2(30 CHAR) NOT NULL,
  source_name VARCHAR2(100 CHAR) NOT NULL,
  CONSTRAINT pk_quality_table_days PRIMARY KEY (table_name, report_date),
  CONSTRAINT ck_quality_boxes CHECK (approved + blocked <= 450359962737049)
);
CREATE INDEX idx_quality_table_days_date ON quality_table_days(report_date);

CREATE TABLE quality_piece_details (
  report_date VARCHAR2(10 CHAR) NOT NULL
    CHECK (REGEXP_LIKE(report_date, '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')),
  piece VARCHAR2(100 CHAR) NOT NULL,
  broken_without_piece NUMBER(16,0) NOT NULL CHECK (broken_without_piece >= 0),
  fissure NUMBER(16,0) NOT NULL CHECK (fissure >= 0),
  sharp_burr NUMBER(16,0) NOT NULL CHECK (sharp_burr >= 0),
  stain NUMBER(16,0) NOT NULL CHECK (stain >= 0),
  other NUMBER(16,0) NOT NULL CHECK (other >= 0),
  broken_with_piece NUMBER(16,0) NOT NULL CHECK (broken_with_piece >= 0),
  uploaded_by VARCHAR2(36 CHAR) NOT NULL REFERENCES users(id),
  uploaded_at VARCHAR2(30 CHAR) NOT NULL,
  source_name VARCHAR2(100 CHAR) NOT NULL,
  CONSTRAINT pk_quality_piece_details PRIMARY KEY (report_date, piece)
);
CREATE INDEX idx_quality_piece_details_date ON quality_piece_details(report_date);
