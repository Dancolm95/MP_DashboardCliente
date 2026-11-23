import { DuplicateRecordError } from './index.js';
import { validateBoxControlBatch } from '../box-control.js';

// Bellia uses the same repository contract for SQLite and Oracle.
export async function createOracleRepository(config, driver) {
  const { ORACLE_USER: user, ORACLE_PASSWORD: password, ORACLE_CONNECT_STRING: connectString } = config;
  if (!user || !password || !connectString) {
    throw new Error('Faltan ORACLE_USER, ORACLE_PASSWORD u ORACLE_CONNECT_STRING.');
  }
  const oracledb = driver || (await import('oracledb')).default;
  const pool = await oracledb.createPool({
    user, password, connectString, poolMin: 1, poolMax: 4, poolIncrement: 1,
  });
  const options = { outFormat: oracledb.OUT_FORMAT_OBJECT };
  async function query(sql, binds = {}) {
    const connection = await pool.getConnection();
    try {
      return (await connection.execute(sql, binds, options)).rows;
    } finally {
      await connection.close();
    }
  }
  async function execute(sql, binds = {}) {
    const connection = await pool.getConnection();
    try {
      return await connection.execute(sql, binds, { autoCommit: true });
    } finally {
      await connection.close();
    }
  }
  const userSelect = 'SELECT id AS "id", email AS "email", name AS "name", password_hash AS "passwordHash", role AS "role", created_at AS "createdAt" FROM users';
  return {
    qualityVersion: 3,
    async getUserByEmail(email) {
      return (await query(`${userSelect} WHERE email = :email`, { email }))[0] || null;
    },
    async getUserById(id) {
      return (await query(`${userSelect} WHERE id = :id`, { id }))[0] || null;
    },
    async listUsers() {
      return query(`SELECT id AS "id", email AS "email", name AS "name", role AS "role",
        created_at AS "createdAt" FROM users ORDER BY created_at DESC`);
    },
    async createUser(user) {
      await execute(`INSERT INTO users (id,email,name,password_hash,role,created_at)
        VALUES (:id,:email,:name,:passwordHash,:role,:createdAt)`, user);
      return user;
    },
    async deleteViewer(id) {
      const result = await execute("DELETE FROM users WHERE id = :id AND role = 'viewer'", { id });
      return result.rowsAffected > 0;
    },
    async createSession(tokenHash, userId, expiresAt, lastActivityAt) {
      await execute(`INSERT INTO sessions (token_hash,user_id,expires_at,last_activity_at)
        VALUES (:tokenHash,:userId,:expiresAt,:lastActivityAt)`, { tokenHash, userId, expiresAt, lastActivityAt });
    },
    async getSession(tokenHash) {
      return (await query(`SELECT user_id AS "userId", expires_at AS "expiresAt", last_activity_at AS "lastActivityAt"
        FROM sessions WHERE token_hash = :tokenHash`, { tokenHash }))[0] || null;
    },
    async touchSession(tokenHash, lastActivityAt) {
      await execute('UPDATE sessions SET last_activity_at = GREATEST(last_activity_at, :lastActivityAt) WHERE token_hash = :tokenHash', { tokenHash, lastActivityAt });
    },
    async deleteSession(tokenHash) {
      await execute('DELETE FROM sessions WHERE token_hash = :tokenHash', { tokenHash });
    },
    async listQualityRecords(from, to) {
      return query(`SELECT table_name AS "table", report_date AS "date",
        staff AS "staff", hours AS "hours", approved AS "approved", blocked AS "blocked",
        detail_provided AS "detailProvided", source_name AS "sourceName",
        uploaded_at AS "uploadedAt" FROM quality_table_days
        WHERE report_date BETWEEN :fromDate AND :toDate
        ORDER BY report_date, table_name`, { fromDate: from, toDate: to });
    },
    async listQualityDetails(from, to) {
      return query(`SELECT report_date AS "date", piece AS "piece",
        broken_without_piece AS "brokenWithoutPiece", fissure AS "fissure",
        sharp_burr AS "sharpBurr", stain AS "stain", other AS "other",
        broken_with_piece AS "brokenWithPiece" FROM quality_piece_details
        WHERE report_date BETWEEN :fromDate AND :toDate
        ORDER BY report_date, piece`, { fromDate: from, toDate: to });
    },
    async insertQualityBatch({ records, details = [], detailProvided = false, uploadedBy, sourceName }) {
      validateBoxControlBatch(records, details);
      const uploadedAt = new Date().toISOString();
      const connection = await pool.getConnection();
      try {
        for (const row of records) {
          await connection.execute(`INSERT INTO quality_table_days
            (table_name,report_date,staff,hours,approved,blocked,detail_provided,
            uploaded_by,uploaded_at,source_name)
            VALUES (:tableName,:reportDate,:staff,:hours,:approved,:blocked,
            :detailProvided,:uploadedBy,:uploadedAt,:sourceName)`, {
            tableName: row.table, reportDate: row.date, staff: row.staff, hours: row.hours,
            approved: row.approved, blocked: row.blocked, detailProvided: Number(detailProvided),
            uploadedBy, uploadedAt, sourceName,
          }, { autoCommit: false });
        }
        for (const row of details) {
          await connection.execute(`INSERT INTO quality_piece_details
            (report_date,piece,broken_without_piece,fissure,sharp_burr,stain,other,
            broken_with_piece,uploaded_by,uploaded_at,source_name)
            VALUES (:reportDate,:piece,:brokenWithoutPiece,:fissure,:sharpBurr,:stain,:other,
            :brokenWithPiece,:uploadedBy,:uploadedAt,:sourceName)`, {
            reportDate: row.date, piece: row.piece, brokenWithoutPiece: row.brokenWithoutPiece,
            fissure: row.fissure, sharpBurr: row.sharpBurr, stain: row.stain,
            other: row.other, brokenWithPiece: row.brokenWithPiece,
            uploadedBy, uploadedAt, sourceName,
          }, { autoCommit: false });
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        if (error.errorNum === 1) {
          throw new DuplicateRecordError();
        }
        throw error;
      } finally { await connection.close(); }
    },
    async close() { await pool.close(10); },
  };
}
