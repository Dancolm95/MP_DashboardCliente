import test from 'node:test';
import assert from 'node:assert/strict';
import { createOracleRepository } from './db/oracle.js';
import { buildDashboard } from './quality.js';
import { exampleRecords, exampleDetails } from './test-fixtures.js';

const config = { ORACLE_USER: 'bellia', ORACLE_PASSWORD: 'test', ORACLE_CONNECT_STRING: 'test' };

function fakeOracle() {
  const saved = { records: [], details: [] };
  const state = { commits: 0, rollbacks: 0 };
  return {
    state,
    driver: {
      OUT_FORMAT_OBJECT: 1,
      async createPool() {
        return {
          async getConnection() {
            const pending = { records: [], details: [] };
            return {
              async execute(sql, binds = {}, options = {}) {
                if (sql.startsWith('INSERT INTO quality_table_days')) {
                  assert.equal(options.autoCommit, false);
                  const row = {
                    table: binds.tableName, date: binds.reportDate, staff: binds.staff,
                    hours: binds.hours, approved: binds.approved, blocked: binds.blocked,
                    detailProvided: binds.detailProvided,
                  };
                  if ([...saved.records, ...pending.records].some(item => item.table === row.table && item.date === row.date)) {
                    throw Object.assign(new Error('ORA-00001'), { errorNum: 1 });
                  }
                  pending.records.push(row);
                  return { rowsAffected: 1 };
                }
                if (sql.startsWith('INSERT INTO quality_piece_details')) {
                  assert.equal(options.autoCommit, false);
                  const row = {
                    date: binds.reportDate, piece: binds.piece,
                    brokenWithoutPiece: binds.brokenWithoutPiece, fissure: binds.fissure,
                    sharpBurr: binds.sharpBurr, stain: binds.stain, other: binds.other,
                    brokenWithPiece: binds.brokenWithPiece,
                  };
                  if ([...saved.details, ...pending.details].some(item => item.piece === row.piece && item.date === row.date)) {
                    throw Object.assign(new Error('ORA-00001'), { errorNum: 1 });
                  }
                  pending.details.push(row);
                  return { rowsAffected: 1 };
                }
                if (sql.includes('FROM quality_table_days')) {
                  return { rows: saved.records.filter(row => row.date >= binds.fromDate && row.date <= binds.toDate) };
                }
                if (sql.includes('FROM quality_piece_details')) {
                  return { rows: saved.details.filter(row => row.date >= binds.fromDate && row.date <= binds.toDate) };
                }
                throw new Error(`Consulta inesperada: ${sql}`);
              },
              async commit() {
                saved.records.push(...pending.records);
                saved.details.push(...pending.details);
                state.commits += 1;
              },
              async rollback() { state.rollbacks += 1; },
              async close() {},
            };
          },
          async close() {},
        };
      },
    },
  };
}

test('Oracle usa el modelo Bellia y guarda ambas hojas en una transacción', async () => {
  const { driver, state } = fakeOracle();
  const repo = await createOracleRepository(config, driver);
  try {
    assert.equal(repo.qualityVersion, 3);
    await repo.insertQualityBatch({
      records: exampleRecords(), details: exampleDetails(), detailProvided: true,
      uploadedBy: 'admin', sourceName: 'control.xlsx',
    });
    const records = await repo.listQualityRecords('2026-11-18', '2026-11-19');
    const details = await repo.listQualityDetails('2026-11-18', '2026-11-19');
    const dashboard = buildDashboard(records, details);
    assert.equal(state.commits, 1);
    assert.equal(dashboard.summary.inspected, 255);
    assert.equal(dashboard.summary.required, 500);
    assert.equal(dashboard.defects.total, 40);
    assert.deepEqual(dashboard.defects.warnings, []);
    const oneDay = await repo.listQualityRecords('2026-11-18', '2026-11-18');
    assert.equal(oneDay.length, 2);
    const mesaDos = buildDashboard(records, details, { table: 'Mesa 2' });
    assert.equal(mesaDos.summary.inspected, 55);
    assert.equal(mesaDos.summary.required, 150);

    const fresh = { ...exampleRecords()[0], date: '2026-11-20' };
    await assert.rejects(repo.insertQualityBatch({
      records: [fresh, exampleRecords()[0]], uploadedBy: 'admin', sourceName: 'control.xlsx',
    }), /Ya existe una jornada/);
    assert.equal(state.rollbacks, 1);
    assert.equal((await repo.listQualityRecords('2026-11-20', '2026-11-20')).length, 0);
    await assert.rejects(repo.insertQualityBatch({
      records: [{ ...fresh, staff: 0 }], uploadedBy: 'admin', sourceName: 'control.xlsx',
    }), { status: 400 });
    assert.equal(state.commits, 1);
  } finally { await repo.close(); }
});
