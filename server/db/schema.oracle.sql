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
CREATE TABLE reports (
  id VARCHAR2(36) PRIMARY KEY,
  report_date VARCHAR2(10) NOT NULL UNIQUE,
  uploaded_by VARCHAR2(36) NOT NULL REFERENCES users(id),
  uploaded_at VARCHAR2(30) NOT NULL,
  source_name VARCHAR2(255) NOT NULL,
  is_demo NUMBER(1) DEFAULT 0 NOT NULL
);
CREATE TABLE metrics (
  report_id VARCHAR2(36) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  metric_key VARCHAR2(100) NOT NULL,
  metric_label VARCHAR2(200) NOT NULL,
  metric_value NUMBER(18, 3) NOT NULL,
  PRIMARY KEY (report_id, metric_key)
);
CREATE INDEX idx_reports_date ON reports(report_date);
