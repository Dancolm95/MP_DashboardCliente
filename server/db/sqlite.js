import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DuplicateDateError } from './index.js';
import { groupReports } from './shared.js';

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
    async listReports(from, to) {
      const rows = db.prepare(`SELECT r.id, r.report_date AS date, r.uploaded_at AS uploadedAt,
        r.source_name AS sourceName, r.is_demo AS isDemo, m.metric_key AS metricKey,
        m.metric_label AS metricLabel, m.metric_value AS metricValue
        FROM reports r JOIN metrics m ON m.report_id = r.id
        WHERE r.report_date >= ? AND r.report_date <= ? ORDER BY r.report_date ASC, m.metric_key ASC`).all(from, to);
      return groupReports(rows);
    },
    async insertReport({ date, uploadedBy, sourceName, isDemo = false, metrics }) {
      const id = randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO reports (id,report_date,uploaded_by,uploaded_at,source_name,is_demo) VALUES (?,?,?,?,?,?)')
          .run(id, date, uploadedBy, new Date().toISOString(), sourceName, isDemo ? 1 : 0);
        const insert = db.prepare('INSERT INTO metrics (report_id,metric_key,metric_label,metric_value) VALUES (?,?,?,?)');
        for (const metric of metrics) insert.run(id, metric.key, metric.label, metric.value);
        db.exec('COMMIT');
        return id;
      } catch (error) {
        db.exec('ROLLBACK');
        if (error.message?.includes('reports.report_date')) throw new DuplicateDateError(date);
        throw error;
      }
    },
    async close() { db.close(); },
  };
  return repo;
}

