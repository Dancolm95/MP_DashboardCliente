import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DuplicateRecordError } from './index.js';
import { validateBoxControlBatch } from '../box-control.js';

export function createSqliteRepository(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(new URL('./schema.sqlite.sql', import.meta.url), 'utf8'));
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
          insertRecord.run(
            id, key, record.date, record.row, record.shift, record.lot, record.product,
            record.received, record.pendingStart, record.inspected, record.approved,
            record.rejected, record.waste, record.pendingEnd, record.staff,
            record.hoursPerPerson, record.observations, uploadedBy, uploadedAt, sourceName,
          );
        }
        const insertIncident = db.prepare(`INSERT INTO quality_incidents
          (id,record_id,report_date,lot,product,defect,affected,action,observation,responsible)
          VALUES (?,?,?,?,?,?,?,?,?,?)`);
        for (const incident of incidents) {
          insertIncident.run(
            randomUUID(), ids.get(incident.recordKey), incident.date, incident.lot,
            incident.product, incident.defect, incident.affected, incident.action,
            incident.observation, incident.responsible,
          );
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        if (error.message?.includes('quality_records.record_key')) throw new DuplicateRecordError();
        throw error;
      }
    },
    async createOperator(operatorId) {
      if (typeof operatorId !== 'string' || !operatorId.trim()
        || operatorId !== operatorId.trim() || operatorId.length > 50) {
        throw new Error('Identificador de operario inválido.');
      }
      db.prepare('INSERT INTO operarios (id_operario) VALUES (?)').run(operatorId);
    },
    async insertBoxControlBatch(batch) {
      validateBoxControlBatch(batch);
      db.exec('BEGIN IMMEDIATE');
      try {
        const insertDay = db.prepare(`INSERT INTO trabajo_diario_operario
          (id_operario, fecha, horas_trabajadas) VALUES (?, ?, ?)`);
        const insertBox = db.prepare(`INSERT INTO cajas (codigo, fecha, id_operario)
          VALUES (?, ?, ?)`);
        const insertComposition = db.prepare(`INSERT INTO composicion_caja
          (codigo_caja, momento, optimas) VALUES (?, ?, ?)`);
        const insertDetail = db.prepare(`INSERT INTO detalle_composicion
          (codigo_caja, momento, id_clasificacion, cantidad) VALUES (?, ?, ?, ?)`);
        for (const day of batch.workDays) insertDay.run(day.operatorId, day.date, day.hours);
        for (const box of batch.boxes) {
          insertBox.run(box.code, box.date, box.operatorId);
          for (const moment of ['inicial', 'cierre']) {
            const composition = box[moment];
            insertComposition.run(box.code, moment, composition.optimal);
            for (const detail of composition.details) {
              insertDetail.run(box.code, moment, detail.classificationId, detail.quantity);
            }
          }
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async listBoxControl(from, to) {
      const workDays = db.prepare(`SELECT id_operario AS operatorId, fecha AS date,
        horas_trabajadas AS hours FROM trabajo_diario_operario
        WHERE fecha BETWEEN ? AND ? ORDER BY fecha, id_operario`).all(from, to);
      const boxes = db.prepare(`SELECT codigo AS code, fecha AS date,
        id_operario AS operatorId FROM cajas
        WHERE fecha BETWEEN ? AND ? ORDER BY fecha, codigo`).all(from, to);
      const snapshots = db.prepare(`SELECT c.codigo_caja AS code, c.momento AS moment,
        c.optimas AS optimal, d.id_clasificacion AS classificationId,
        d.cantidad AS quantity FROM composicion_caja c
        JOIN cajas b ON b.codigo = c.codigo_caja
        LEFT JOIN detalle_composicion d ON d.codigo_caja = c.codigo_caja
          AND d.momento = c.momento
        WHERE b.fecha BETWEEN ? AND ? ORDER BY c.codigo_caja, c.momento`).all(from, to);
      const byCode = new Map(boxes.map(box => [box.code, box]));
      for (const row of snapshots) {
        const box = byCode.get(row.code);
        if (!box[row.moment]) box[row.moment] = { optimal: row.optimal, details: [] };
        if (row.classificationId) box[row.moment].details.push({
          classificationId: row.classificationId, quantity: row.quantity,
        });
      }
      return { workDays, boxes };
    },
    async close() { db.close(); },
  };
  return repo;
}

