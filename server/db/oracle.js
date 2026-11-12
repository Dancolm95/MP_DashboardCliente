import { randomUUID } from 'node:crypto';
import { DuplicateDateError } from './index.js';
import { groupReports } from './shared.js';

// This adapter targets the tables in schema.oracle.sql. It cannot be integration
// tested until an Oracle connection and the approved schema are available.
export async function createOracleRepository(config) {
  const { ORACLE_USER: user, ORACLE_PASSWORD: password, ORACLE_CONNECT_STRING: connectString } = config;
  if (!user || !password || !connectString) throw new Error('Faltan ORACLE_USER, ORACLE_PASSWORD u ORACLE_CONNECT_STRING.');
  const oracledb = (await import('oracledb')).default;
  const pool = await oracledb.createPool({ user, password, connectString, poolMin: 1, poolMax: 4, poolIncrement: 1 });
  const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
  async function query(sql, binds = {}) {
    const connection = await pool.getConnection();
    try { return (await connection.execute(sql, binds, options)).rows; }
    finally { await connection.close(); }
  }
  async function execute(sql, binds = {}) {
    const connection = await pool.getConnection();
    try { await connection.execute(sql, binds, { autoCommit: true }); }
    finally { await connection.close(); }
  }
  const userSelect = 'SELECT id AS "id", email AS "email", name AS "name", password_hash AS "passwordHash", role AS "role", created_at AS "createdAt" FROM users';
  return {
    async getUserByEmail(email) { return (await query(`${userSelect} WHERE email = :email`, { email }))[0] || null; },
    async getUserById(id) { return (await query(`${userSelect} WHERE id = :id`, { id }))[0] || null; },
    async listUsers() { return query('SELECT id AS "id", email AS "email", name AS "name", role AS "role", created_at AS "createdAt" FROM users ORDER BY created_at DESC'); },
    async createUser(user) {
      await execute('INSERT INTO users (id,email,name,password_hash,role,created_at) VALUES (:id,:email,:name,:passwordHash,:role,:createdAt)', user);
      return user;
    },
    async createSession(tokenHash, userId, expiresAt) {
      await execute('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (:tokenHash,:userId,:expiresAt)', { tokenHash, userId, expiresAt });
    },
    async getSession(tokenHash) {
      return (await query('SELECT user_id AS "userId", expires_at AS "expiresAt" FROM sessions WHERE token_hash = :tokenHash', { tokenHash }))[0] || null;
    },
    async deleteSession(tokenHash) { await execute('DELETE FROM sessions WHERE token_hash = :tokenHash', { tokenHash }); },
    async listReports(from, to) {
      const rows = await query(`SELECT r.id AS "id", r.report_date AS "date", r.uploaded_at AS "uploadedAt",
        r.source_name AS "sourceName", r.is_demo AS "isDemo", m.metric_key AS "metricKey",
        m.metric_label AS "metricLabel", m.metric_value AS "metricValue"
        FROM reports r JOIN metrics m ON m.report_id = r.id
        WHERE r.report_date >= :fromDate AND r.report_date <= :toDate ORDER BY r.report_date ASC, m.metric_key ASC`, { fromDate: from, toDate: to });
      return groupReports(rows);
    },
    async insertReport({ date, uploadedBy, sourceName, isDemo = false, metrics }) {
      const id = randomUUID();
      const connection = await pool.getConnection();
      try {
        await connection.execute('INSERT INTO reports (id,report_date,uploaded_by,uploaded_at,source_name,is_demo) VALUES (:id,:reportDate,:uploadedBy,:uploadedAt,:sourceName,:isDemo)',
          { id, reportDate: date, uploadedBy, uploadedAt: new Date().toISOString(), sourceName, isDemo: isDemo ? 1 : 0 });
        for (const metric of metrics) {
          await connection.execute('INSERT INTO metrics (report_id,metric_key,metric_label,metric_value) VALUES (:reportId,:metricKey,:metricLabel,:metricValue)',
            { reportId: id, metricKey: metric.key, metricLabel: metric.label, metricValue: metric.value });
        }
        await connection.commit();
        return id;
      } catch (error) {
        await connection.rollback();
        if (error.errorNum === 1) throw new DuplicateDateError(date);
        throw error;
      } finally { await connection.close(); }
    },
    async close() { await pool.close(10); },
  };
}
