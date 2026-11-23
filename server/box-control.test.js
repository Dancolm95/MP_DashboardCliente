import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateBoxControlBatch } from './box-control.js';
import { buildDashboard } from './quality.js';
import { createSqliteRepository } from './db/sqlite.js';
import { exampleRecords, exampleDetails } from './test-fixtures.js';

const user = { id: 'admin', email: 'admin@test.local', name: 'Admin', passwordHash: 'test', role: 'admin', createdAt: '2026-11-19' };
const batch = (records, details = exampleDetails(), detailProvided = true) => ({ records, details, detailProvided, uploadedBy: user.id, sourceName: 'control.xlsx' });

test('totales, sets, meta y productividad por mesa son calculables a mano', () => {
  const records = exampleRecords().map(row => ({ ...row, detailProvided: 1 }));
  const result = buildDashboard(records, exampleDetails());
  assert.equal(result.summary.inspected, 255);
  assert.equal(result.summary.required, 500);
  assert.equal(result.summary.attainmentRate, 51);
  assert.equal(result.summary.sets, 510);
  assert.equal(result.summary.targetMet, 0);
  assert.equal(result.summary.productivity, 255 / 26);
  assert.equal(result.defects.origin, 30);
  assert.equal(result.defects.nonOrigin, 10);
  assert.deepEqual(result.defects.warnings, []);
  assert.equal(result.records.filter(row => row.table === 'Mesa 1' && row.targetMet).length, 0);
  const filtered = buildDashboard(records, exampleDetails(), { table: 'Mesa 2' });
  assert.equal(filtered.summary.inspected, 55);
  assert.equal(filtered.summary.required, 150);
  assert.equal(filtered.summary.attainmentRate, 55 / 150 * 100);
  assert.equal(filtered.defects.total, 40);
  assert.equal(filtered.records[0].targetMet, false);
  assert.equal(buildDashboard([], []).summary.productivity, 0);
  assert.equal(buildDashboard([], []).summary.attainmentRate, 0);
});

test('la meta es 50 cajas por operario y el porcentaje puede superar 100', () => {
  const base = exampleRecords()[0];
  const records = [
    { ...base, date: '2026-11-18', staff: 3, approved: 149, blocked: 0 },
    { ...base, date: '2026-11-19', staff: 3, approved: 150, blocked: 0 },
    { ...base, date: '2026-11-20', staff: 4, approved: 200, blocked: 0 },
    { ...base, date: '2026-11-21', staff: 4, approved: 201, blocked: 0 },
  ];
  const result = buildDashboard(records);
  assert.deepEqual(result.records.map(row => row.targetMet), [true, true, true, false]);
  assert.deepEqual(result.records.map(row => row.required), [200, 200, 150, 150]);
  assert.equal(result.summary.required, 700);
  assert.equal(result.summary.targetMet, 3);
  const last = buildDashboard(records.slice(-1));
  assert.equal(last.summary.required, 200);
  assert.ok(Math.abs(last.summary.attainmentRate - 100.5) < 1e-9);
});

test('diferencia de sets advierte; ausencia de Detalle no advierte', () => {
  const records = exampleRecords().map(row => ({ ...row, detailProvided: 1 }));
  const incomplete = exampleDetails().slice(1);
  assert.deepEqual(buildDashboard(records, incomplete).defects.warnings, ['2026-11-18']);
  assert.deepEqual(buildDashboard(records.map(row => ({ ...row, detailProvided: 0 })), []).defects.warnings, []);
});

test('valida datos y duplicados de ambas hojas', () => {
  for (const mutate of [
    row => { row.hours = 7; }, row => { row.hours = 25; },
    row => { row.date = '2026-02-30'; }, row => { row.table = ''; },
    row => { row.staff = -1; }, row => { row.staff = 0; }, row => { row.approved = 1.5; },
    row => { row.blocked = -1; },
  ]) {
    const rows = exampleRecords(); mutate(rows[0]);
    assert.throws(() => validateBoxControlBatch(rows, exampleDetails()), { status: 400 });
  }
  assert.throws(() => validateBoxControlBatch([exampleRecords()[0], exampleRecords()[0]]), /repetida/);
  assert.throws(() => validateBoxControlBatch(exampleRecords(), [exampleDetails()[0], exampleDetails()[0]]), /repetido/);
  validateBoxControlBatch([{ ...exampleRecords()[0], approved: 0, blocked: 0 }], []);
  validateBoxControlBatch([{ ...exampleRecords()[0], staff: 1 }], []);
});

test('SQLite guarda ambas hojas atómicamente y rechaza bases antiguas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bellia-'));
  const path = join(dir, 'bellia.db');
  try {
    let repo = createSqliteRepository(path);
    await repo.createUser(user);
    await repo.insertQualityBatch(batch(exampleRecords()));
    assert.equal((await repo.listQualityRecords('2026-11-18', '2026-11-18')).length, 2);
    assert.equal((await repo.listQualityDetails('2026-11-18', '2026-11-19')).length, 3);
    const fresh = { ...exampleRecords()[0], date: '2026-11-20' };
    await assert.rejects(repo.insertQualityBatch(batch([fresh, exampleRecords()[0]], [])), /Ya existe/);
    assert.equal((await repo.listQualityRecords('2026-11-20', '2026-11-20')).length, 0);
    await repo.close();
    repo = createSqliteRepository(path);
    assert.equal((await repo.listQualityRecords('2026-11-18', '2026-11-19')).length, 3);
    await repo.close();
    const check = new DatabaseSync(path);
    assert.throws(() => check.exec('UPDATE quality_table_days SET hours = 7'), /CHECK/);
    assert.throws(() => check.exec('UPDATE quality_table_days SET staff = 0'), /CHECK/);
    assert.throws(() => check.exec('UPDATE quality_piece_details SET fissure = -1'), /CHECK/);
    check.close();
    const old = new DatabaseSync(join(dir, 'old.db'));
    old.exec('PRAGMA user_version = 2'); old.close();
    assert.throws(() => createSqliteRepository(join(dir, 'old.db')), /base SQLite nueva/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('el script SQL crea una base vacía que la aplicación reconoce', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bellia-schema-'));
  const path = join(dir, 'bellia.db');
  try {
    const db = new DatabaseSync(path);
    db.exec(readFileSync(new URL('./db/schema.sqlite.sql', import.meta.url), 'utf8'));
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map(row => row.name), ['quality_piece_details', 'quality_table_days', 'sessions', 'users']);
    db.close();
    const repo = createSqliteRepository(path);
    await repo.createUser(user);
    assert.equal((await repo.getUserByEmail(user.email)).id, user.id);
    await repo.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
