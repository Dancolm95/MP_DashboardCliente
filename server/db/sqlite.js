import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DuplicateRecordError } from './index.js';
import { validateBoxControlBatch } from '../box-control.js';

export function createSqliteRepository(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version !== 0 && version !== 3) { db.close(); throw new Error('Bellia requiere una base SQLite nueva.'); }
  if (version === 0) {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
      db.close();
      throw new Error('Bellia requiere una base SQLite nueva.');
    }
    try {
      db.exec(readFileSync(new URL('./schema.sqlite.sql', import.meta.url), 'utf8'));
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* El script pudo cerrar la transacción. */ }
      db.close();
      throw error;
    }
  }
  const userFields = 'id, email, name, password_hash AS passwordHash, role, created_at AS createdAt';
  const repo = {
    qualityVersion: 3,
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
    async createSession(tokenHash, userId, expiresAt, lastActivityAt) {
      db.prepare(`INSERT INTO sessions (token_hash,user_id,expires_at,last_activity_at)
        VALUES (?,?,?,?)`).run(tokenHash, userId, expiresAt, lastActivityAt);
    },
    async getSession(tokenHash) {
      return db.prepare(`SELECT user_id AS userId, expires_at AS expiresAt, last_activity_at AS lastActivityAt
        FROM sessions WHERE token_hash = ?`).get(tokenHash) || null;
    },
    async touchSession(tokenHash, lastActivityAt) {
      db.prepare('UPDATE sessions SET last_activity_at = MAX(last_activity_at, ?) WHERE token_hash = ?')
        .run(lastActivityAt, tokenHash);
    },
    async deleteSession(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },
    async listQualityRecords(from, to) {
      return db.prepare(`SELECT table_name AS "table", report_date AS date,
        staff, hours, approved, blocked, detail_provided AS detailProvided,
        source_name AS sourceName, uploaded_at AS uploadedAt FROM quality_table_days
        WHERE report_date BETWEEN ? AND ? ORDER BY report_date, table_name`).all(from, to);
    },
    async listQualityDetails(from, to) {
      return db.prepare(`SELECT report_date AS date, piece,
        broken_without_piece AS brokenWithoutPiece, fissure, sharp_burr AS sharpBurr,
        stain, other, broken_with_piece AS brokenWithPiece
        FROM quality_piece_details WHERE report_date BETWEEN ? AND ?
        ORDER BY report_date, piece`).all(from, to);
    },
    async insertQualityBatch({ records, details = [], detailProvided = false, uploadedBy, sourceName }) {
      validateBoxControlBatch(records, details);
      const uploadedAt = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        const insert = db.prepare(`INSERT INTO quality_table_days
          (table_name, report_date, staff, hours, approved, blocked, detail_provided,
          uploaded_by, uploaded_at, source_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const row of records) insert.run(row.table, row.date, row.staff, row.hours,
          row.approved, row.blocked, Number(detailProvided), uploadedBy, uploadedAt, sourceName);
        const insertDetail = db.prepare(`INSERT INTO quality_piece_details
          (report_date, piece, broken_without_piece, fissure, sharp_burr, stain,
          other, broken_with_piece, uploaded_by, uploaded_at, source_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const row of details) insertDetail.run(row.date, row.piece, row.brokenWithoutPiece,
          row.fissure, row.sharpBurr, row.stain, row.other, row.brokenWithPiece,
          uploadedBy, uploadedAt, sourceName);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        if (error.message?.includes('UNIQUE constraint failed: quality_')) {
          throw new DuplicateRecordError();
        }
        throw error;
      }
    },
    async close() { db.close(); },
  };
  return repo;
}

