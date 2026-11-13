import { randomUUID } from 'node:crypto';
import { DuplicateRecordError } from './index.js';

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
    async listQualityRecords(from, to) {
      return query(`SELECT id AS "id", report_date AS "date", row_order AS "rowOrder",
        shift AS "shift", lot AS "lot", product AS "product", received AS "received",
        pending_start AS "pendingStart", inspected AS "inspected", approved AS "approved",
        rejected AS "rejected", waste AS "waste", pending_end AS "pendingEnd",
        staff AS "staff", hours_per_person AS "hoursPerPerson",
        observations AS "observations", source_name AS "sourceName", uploaded_at AS "uploadedAt" FROM quality_records
        WHERE report_date >= :fromDate AND report_date <= :toDate
        ORDER BY report_date, uploaded_at, row_order`, { fromDate: from, toDate: to });
    },
    async listQualityIncidents(from, to) {
      return query(`SELECT i.id AS "id", i.record_id AS "recordId", i.report_date AS "date",
        r.shift AS "shift", i.lot AS "lot", i.product AS "product",
        i.defect AS "defect", i.affected AS "affected", i.action AS "action",
        i.observation AS "observation", i.responsible AS "responsible"
        FROM quality_incidents i JOIN quality_records r ON r.id = i.record_id
        WHERE i.report_date >= :fromDate AND i.report_date <= :toDate
        ORDER BY i.report_date, i.lot`, { fromDate: from, toDate: to });
    },
    async insertQualityBatch({ records, incidents, uploadedBy, sourceName }) {
      const ids = new Map();
      const uploadedAt = new Date().toISOString();
      const connection = await pool.getConnection();
      try {
        for (const record of records) {
          const id = randomUUID();
          const recordKey = `${record.date}|${record.shift.toLowerCase()}|${record.lot.toLowerCase()}`;
          ids.set(recordKey, id);
          await connection.execute(`INSERT INTO quality_records
            (id,record_key,report_date,row_order,shift,lot,product,received,pending_start,
            inspected,approved,rejected,waste,pending_end,staff,hours_per_person,
            observations,uploaded_by,uploaded_at,source_name)
            VALUES (:id,:recordKey,:reportDate,:rowOrder,:shift,:lot,:product,:received,
            :pendingStart,:inspected,:approved,:rejected,:waste,:pendingEnd,:staff,
            :hoursPerPerson,:observations,:uploadedBy,:uploadedAt,:sourceName)`,
            { id, recordKey, reportDate: record.date, rowOrder: record.row, shift: record.shift,
              lot: record.lot, product: record.product, received: record.received,
              pendingStart: record.pendingStart, inspected: record.inspected,
              approved: record.approved, rejected: record.rejected, waste: record.waste,
              pendingEnd: record.pendingEnd, staff: record.staff,
              hoursPerPerson: record.hoursPerPerson, observations: record.observations || null,
              uploadedBy, uploadedAt, sourceName });
        }
        for (const incident of incidents) {
          await connection.execute(`INSERT INTO quality_incidents
            (id,record_id,report_date,lot,product,defect,affected,action,observation,responsible)
            VALUES (:id,:recordId,:reportDate,:lot,:product,:defect,:affected,:action,
            :observation,:responsible)`,
            { id: randomUUID(), recordId: ids.get(incident.recordKey), reportDate: incident.date,
              lot: incident.lot, product: incident.product, defect: incident.defect,
              affected: incident.affected, action: incident.action || null,
              observation: incident.observation || null, responsible: incident.responsible || null });
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        if (error.errorNum === 1) throw new DuplicateRecordError();
        throw error;
      } finally { await connection.close(); }
    },
    async close() { await pool.close(10); },
  };
}
