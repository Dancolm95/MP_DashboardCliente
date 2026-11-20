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
  expires_at VARCHAR2(30) NOT NULL,
  last_activity_at VARCHAR2(30)
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

CREATE TABLE clasificaciones (
  id_clasificacion VARCHAR2(20) PRIMARY KEY,
  nombre VARCHAR2(50) NOT NULL UNIQUE
);
INSERT INTO clasificaciones VALUES ('TOLERADO', 'Tolerado');
INSERT INTO clasificaciones VALUES ('MENOR', 'Menor');
INSERT INTO clasificaciones VALUES ('MAYOR', 'Mayor');
INSERT INTO clasificaciones VALUES ('CRITICO', 'Crítico');

CREATE TABLE operarios (
  id_operario VARCHAR2(50) PRIMARY KEY
);
CREATE TABLE trabajo_diario_operario (
  id_operario VARCHAR2(50) NOT NULL REFERENCES operarios(id_operario),
  fecha VARCHAR2(10) NOT NULL,
  horas_trabajadas NUMBER(10,2) NOT NULL CHECK (horas_trabajadas > 0),
  PRIMARY KEY (id_operario, fecha)
);
CREATE TABLE cajas (
  codigo VARCHAR2(100) PRIMARY KEY,
  fecha VARCHAR2(10) NOT NULL,
  id_operario VARCHAR2(50) NOT NULL,
  FOREIGN KEY (id_operario, fecha)
    REFERENCES trabajo_diario_operario(id_operario, fecha)
);
CREATE INDEX idx_cajas_fecha ON cajas(fecha);
CREATE TABLE composicion_caja (
  codigo_caja VARCHAR2(100) NOT NULL REFERENCES cajas(codigo),
  momento VARCHAR2(10) NOT NULL CHECK (momento IN ('inicial', 'cierre')),
  optimas NUMBER(2) NOT NULL CHECK (optimas BETWEEN 0 AND 20),
  PRIMARY KEY (codigo_caja, momento)
);
CREATE TABLE detalle_composicion (
  codigo_caja VARCHAR2(100) NOT NULL,
  momento VARCHAR2(10) NOT NULL,
  id_clasificacion VARCHAR2(20) NOT NULL REFERENCES clasificaciones(id_clasificacion),
  cantidad NUMBER(2) NOT NULL CHECK (cantidad BETWEEN 1 AND 20),
  PRIMARY KEY (codigo_caja, momento, id_clasificacion),
  FOREIGN KEY (codigo_caja, momento)
    REFERENCES composicion_caja(codigo_caja, momento)
);
