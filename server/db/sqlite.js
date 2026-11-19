import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DuplicateRecordError } from './index.js';
import { validateBoxControlBatch } from '../box-control.js';

export function createSqliteRepository(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  // V1 no contiene la atribución necesaria para convertir sus totales a operarios.
  // Se recrean solo los datos de calidad del prototipo; usuarios y sesiones se conservan.
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 2) { db.close(); throw new Error('Versión SQLite no compatible.'); }
  db.exec('BEGIN IMMEDIATE');
  try {
    if (version < 2) db.exec(`
      DROP TABLE IF EXISTS detalle_composicion;
      DROP TABLE IF EXISTS composicion_caja;
      DROP TABLE IF EXISTS cajas;
      DROP TABLE IF EXISTS trabajo_diario_operario;
      DROP TABLE IF EXISTS operarios;
      DROP TABLE IF EXISTS clasificaciones;
      DROP TABLE IF EXISTS quality_incidents;
      DROP TABLE IF EXISTS quality_records;
    `);
    db.exec(readFileSync(new URL('./schema.sqlite.sql', import.meta.url), 'utf8'));
    db.exec('PRAGMA user_version = 2; COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  const userFields = 'id, email, name, password_hash AS passwordHash, role, created_at AS createdAt';
  const repo = {
    async getUserByEmail(email) {
      return db.prepare(`SELECT ${userFields} FROM users WHERE email = ?`).get(email) || null;
    },
    async getUserById(id) {
      return db.prepare(`SELECT ${userFields} FROM users WHERE id = ?`).get(id) || null;
    },
    async listUsers() {
      return db.prepare(`SELECT id, email, name, role, created_at AS createdAt
        FROM users ORDER BY created_at DESC`).all();
    },
    async createUser(user) {
      db.prepare(`INSERT INTO users (id,email,name,password_hash,role,created_at)
        VALUES (?,?,?,?,?,?)`).run(
        user.id, user.email, user.name, user.passwordHash, user.role, user.createdAt,
      );
      return user;
    },
    async deleteViewer(id) {
      return db.prepare("DELETE FROM users WHERE id = ? AND role = 'viewer'").run(id).changes > 0;
    },
    async createSession(tokenHash, userId, expiresAt) {
      db.prepare(`INSERT INTO sessions (token_hash,user_id,expires_at)
        VALUES (?,?,?)`).run(tokenHash, userId, expiresAt);
    },
    async getSession(tokenHash) {
      return db.prepare(`SELECT user_id AS userId, expires_at AS expiresAt
        FROM sessions WHERE token_hash = ?`).get(tokenHash) || null;
    },
    async deleteSession(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },
    async listQualityRecords(from, to) {
      return db.prepare(`SELECT operator_id AS operatorId, report_date AS date,
        hours, approved, blocked, tolerated, minor, major, critical,
        source_name AS sourceName, uploaded_at AS uploadedAt FROM quality_workdays
        WHERE report_date BETWEEN ? AND ? ORDER BY report_date, operator_id`).all(from, to);
    },
    async insertQualityBatch({ records, uploadedBy, sourceName }) {
      validateBoxControlBatch(records);
      const uploadedAt = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        const insert = db.prepare(`INSERT INTO quality_workdays
          (operator_id, report_date, hours, approved, blocked, tolerated, minor,
          major, critical, uploaded_by, uploaded_at, source_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const row of records) insert.run(row.operatorId, row.date, row.hours,
          row.approved, row.blocked, row.tolerated, row.minor, row.major, row.critical,
          uploadedBy, uploadedAt, sourceName);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        if (error.message?.includes('UNIQUE constraint failed: quality_workdays.')) {
          throw new DuplicateRecordError('Ya existe un consolidado para ese operario y fecha. No se importó ninguna fila.');
        }
        throw error;
      }
    },
    async close() { db.close(); },
  };
  return repo;
}

