-- Apply once in the application schema. If your DBA supplies existing tables,
-- map the Oracle adapter to those tables instead of running this file.
CREATE TABLE users (
  id VARCHAR2(36) PRIMARY KEY,
  email VARCHAR2(255) NOT NULL UNIQUE,
  name VARCHAR2(200) NOT NULL,
  password_hash VARCHAR2(300) NOT NULL,
  role VARCHAR2(10) NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at VARCHAR2(30) NOT NULL
);
CREATE TABLE sessions (
  token_hash VARCHAR2(64) PRIMARY KEY,
  user_id VARCHAR2(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at VARCHAR2(30) NOT NULL
);
CREATE TABLE quality_records (
  id VARCHAR2(36) PRIMARY KEY,
  record_key VARCHAR2(400) NOT NULL UNIQUE,
  report_date VARCHAR2(10) NOT NULL,
  row_order NUMBER(8) NOT NULL,
  shift VARCHAR2(50) NOT NULL,
  lot VARCHAR2(150) NOT NULL,
  product VARCHAR2(150) NOT NULL,
  received NUMBER(18,3) NOT NULL,
  pending_start NUMBER(18,3) NOT NULL,
  inspected NUMBER(18,3) NOT NULL,
  approved NUMBER(18,3) NOT NULL,
  rejected NUMBER(18,3) NOT NULL,
  waste NUMBER(18,3) NOT NULL,
  pending_end NUMBER(18,3) NOT NULL,
  staff NUMBER(18,3) NOT NULL,
  hours_per_person NUMBER(18,3) NOT NULL,
  observations VARCHAR2(2000),
  uploaded_by VARCHAR2(36) NOT NULL REFERENCES users(id),
  uploaded_at VARCHAR2(30) NOT NULL,
  source_name VARCHAR2(255) NOT NULL
);
CREATE TABLE quality_incidents (
  id VARCHAR2(36) PRIMARY KEY,
  record_id VARCHAR2(36) NOT NULL REFERENCES quality_records(id) ON DELETE CASCADE,
  report_date VARCHAR2(10) NOT NULL,
  lot VARCHAR2(150) NOT NULL,
  product VARCHAR2(150) NOT NULL,
  defect VARCHAR2(150) NOT NULL,
  affected NUMBER(18,3) NOT NULL,
  action VARCHAR2(150),
  observation VARCHAR2(2000),
  responsible VARCHAR2(150)
);
CREATE INDEX idx_quality_records_date ON quality_records(report_date);
CREATE INDEX idx_quality_incidents_date ON quality_incidents(report_date);
