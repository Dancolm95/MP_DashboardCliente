import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DuplicateRecordError } from './index.js';

export function createSqliteRepository(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(new URL('./schema.sqlite.sql', import.meta.url), 'utf8'));
  const userFields = 'id, email, name, password_hash AS passwordHash, role, created_at AS createdAt';
  const repo = {
    async getUserByEmail(email) { return db.prepare(`SELECT ${userFields} FROM users WHERE email = ?`).get(email) || null; },
    async getUserById(id) { return db.prepare(`SELECT ${userFields} FROM users WHERE id = ?`).get(id) || null; },
    async listUsers() { return db.prepare('SELECT id, email, name, role, created_at AS createdAt FROM users ORDER BY created_at DESC').all(); },
    async createUser(user) {
      db.prepare('INSERT INTO users (id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)').run(user.id, user.email, user.name, user.passwordHash, user.role, user.createdAt);
      return user;
    },
    async createSession(tokenHash, userId, expiresAt) {
      db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(tokenHash, userId, expiresAt);
    },
    async getSession(tokenHash) {
      return db.prepare('SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token_hash = ?').get(tokenHash) || null;
    },
    async deleteSession(tokenHash) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash); },
    async listQualityRecords(from, to) {
      return db.prepare(`SELECT id, report_date AS date, row_order AS rowOrder, shift, lot, product,
        received, pending_start AS pendingStart, inspected, approved, rejected, waste,
        pending_end AS pendingEnd, staff, hours_per_person AS hoursPerPerson,
        observations, source_name AS sourceName, uploaded_at AS uploadedAt FROM quality_records
        WHERE report_date >= ? AND report_date <= ? ORDER BY report_date, uploaded_at, row_order`).all(from, to);
    },
    async listQualityIncidents(from, to) {
      return db.prepare(`SELECT i.id, i.record_id AS recordId, i.report_date AS date,
        r.shift, i.lot, i.product, i.defect, i.affected, i.action,
        i.observation, i.responsible FROM quality_incidents i
        JOIN quality_records r ON r.id = i.record_id
        WHERE i.report_date >= ? AND i.report_date <= ? ORDER BY i.report_date, i.lot`).all(from, to);
    },
    async insertQualityBatch({ records, incidents, uploadedBy, sourceName }) {
      const ids = new Map();
      const uploadedAt = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        const insertRecord = db.prepare(`INSERT INTO quality_records
          (id,record_key,report_date,row_order,shift,lot,product,received,pending_start,
          inspected,approved,rejected,waste,pending_end,staff,hours_per_person,
          observations,uploaded_by,uploaded_at,source_name)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const record of records) {
          const id = randomUUID();
          const key = `${record.date}|${record.shift.toLowerCase()}|${record.lot.toLowerCase()}`;
          ids.set(key, id);
          insertRecord.run(id, key, record.date, record.row, record.shift, record.lot, record.product,
            record.received, record.pendingStart, record.inspected, record.approved, record.rejected,
            record.waste, record.pendingEnd, record.staff, record.hoursPerPerson,
            record.observations, uploadedBy, uploadedAt, sourceName);
        }
        const insertIncident = db.prepare(`INSERT INTO quality_incidents
          (id,record_id,report_date,lot,product,defect,affected,action,observation,responsible)
          VALUES (?,?,?,?,?,?,?,?,?,?)`);
        for (const incident of incidents) insertIncident.run(randomUUID(), ids.get(incident.recordKey),
          incident.date, incident.lot, incident.product, incident.defect, incident.affected,
          incident.action, incident.observation, incident.responsible);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        if (error.message?.includes('quality_records.record_key')) throw new DuplicateRecordError();
        throw error;
      }
    },
    async close() { db.close(); },
  };
  return repo;
}

