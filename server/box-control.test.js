import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteRepository } from './db/sqlite.js';
import { validateBoxControlBatch } from './box-control.js';
import { buildDashboard } from './quality.js';
import { exampleRecords } from './test-fixtures.js';

const user = { id: 'admin', email: 'admin@test.local', name: 'Admin', passwordHash: 'test', role: 'admin', createdAt: '2026-11-19' };
const batch = records => ({ records, uploadedBy: user.id, sourceName: 'control.xlsx' });

test('consolidado: totales, productividad ponderada, clasificaciones y filtros calculables a mano', () => {
  const records = exampleRecords();
  validateBoxControlBatch(records);
  const result = buildDashboard(records);
  assert.deepEqual(result.summary, {
    approved: 54, blocked: 6, inspected: 60, hours: 10, observed: 11,
    inspectedUnits: 1200, productivity: 6, approvalRate: 90, blockedRate: 10,
    workDays: 3, operatorCount: 2, daysWithRecords: 2,
  });
  assert.deepEqual(result.operators.map(r => [r.operatorId, r.inspected, r.hours, r.productivity]), [
    ['Luis', 20, 2, 10], ['Ana', 40, 8, 5],
  ]);
  assert.deepEqual(result.daily.map(r => [r.date, r.inspected, r.productivity]), [
    ['2026-11-18', 30, 7.5], ['2026-11-19', 30, 5],
  ]);
  assert.deepEqual(result.classifications.map(r => r.units), [3, 3, 3, 2]);
  const ana = buildDashboard(records, { operator: 'Ana' });
  assert.equal(ana.summary.inspected, 40);
  assert.equal(ana.summary.productivity, 5);
  assert.equal(ana.summary.observed, 10);
  assert.equal(ana.summary.daysWithRecords, 2);
  assert.equal(ana.daily[0].inspected, 10);
  assert.deepEqual(ana.options.operators, ['Ana', 'Luis']);
  assert.equal(buildDashboard(records, { operator: 'Nadie' }).summary.productivity, 0);
  assert.equal(buildDashboard(records.filter(row => row.date === '2026-11-18')).summary.daysWithRecords, 1);
  assert.equal(buildDashboard(records, { operator: 'Nadie' }).summary.daysWithRecords, 0);
  assert.equal(buildDashboard([]).summary.approvalRate, 0);
  assert.deepEqual(buildDashboard([]).classifications.map(r => r.units), [0, 0, 0, 0]);
});

test('valida jornadas, cantidades enteras, capacidad y todas las clasificaciones como bloqueo', () => {
  const invalid = [
    r => { r.hours = 0; }, r => { r.hours = 25; }, r => { r.hours = NaN; },
    r => { r.date = '2026-02-30'; }, r => { r.operatorId = ''; },
    r => { r.approved = 1.5; }, r => { r.blocked = -1; },
    r => { r.minor = -1; }, r => { r.critical = 0.5; },
    r => { r.tolerated = 50; }, r => { r.blocked = 5; },
    r => { r.approved = Number.MAX_SAFE_INTEGER; },
  ];
  for (const mutate of invalid) {
    const records = exampleRecords(); mutate(records[0]);
    assert.throws(() => validateBoxControlBatch(records), { status: 400 });
  }
  assert.throws(() => validateBoxControlBatch([exampleRecords()[0], exampleRecords()[0]]), /repetida/);
  for (const classification of ['tolerated', 'minor', 'major', 'critical']) {
    const row = { ...exampleRecords()[0], blocked: 1, tolerated: 0, minor: 0, major: 0, critical: 0, [classification]: 1 };
    validateBoxControlBatch([row]);
    assert.throws(() => validateBoxControlBatch([{ ...row, blocked: 0 }]), /observadas/);
  }
  validateBoxControlBatch([{ ...exampleRecords()[0], approved: 0, blocked: 0, tolerated: 0, minor: 0, major: 0, critical: 0 }]);
});

test('SQLite guarda por operario/fecha y rechaza el lote completo ante duplicados o datos inválidos', async () => {
  const repo = createSqliteRepository(':memory:');
  try {
    await repo.createUser(user);
    await repo.insertQualityBatch(batch(exampleRecords()));
    assert.equal((await repo.listQualityRecords('2026-11-18', '2026-11-18')).length, 2);
    const fresh = { ...exampleRecords()[0], date: '2026-11-20' };
    await assert.rejects(repo.insertQualityBatch(batch([fresh, exampleRecords()[0]])), /Ya existe/);
    assert.equal((await repo.listQualityRecords('2026-11-20', '2026-11-20')).length, 0);
    await assert.rejects(repo.insertQualityBatch(batch([fresh, { ...fresh, operatorId: 'Otro', hours: 0 }])));
    assert.equal((await repo.listQualityRecords('2026-11-20', '2026-11-20')).length, 0);
    await assert.rejects(repo.insertQualityBatch({ ...batch([fresh]), uploadedBy: 'missing' }), /FOREIGN KEY/);
  } finally { await repo.close(); }
});

test('migración del prototipo conserva usuarios/sesiones y no borra Calidad V2 al reabrir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-v2-'));
  const path = join(dir, 'test.db');
  try {
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, password_hash TEXT, role TEXT, created_at TEXT);
      INSERT INTO users VALUES ('admin', 'admin@test.local', 'Admin', 'test', 'admin', '2026-11-19');
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT);
      INSERT INTO sessions VALUES ('token', 'admin', '2027-01-01');
      CREATE TABLE quality_records (id TEXT);
      CREATE TABLE cajas (codigo TEXT);`);
    db.close();
    let repo = createSqliteRepository(path);
    assert.equal((await repo.getUserById('admin')).role, 'admin');
    assert.equal((await repo.getSession('token')).userId, 'admin');
    await repo.insertQualityBatch(batch(exampleRecords()));
    await repo.close();
    repo = createSqliteRepository(path);
    assert.equal((await repo.listQualityRecords('2026-11-01', '2026-11-30')).length, 3);
    await repo.close();
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name = 'cajas'").get(), undefined);
    // Defensa en profundidad: las restricciones también se aplican sin pasar por el servicio.
    assert.throws(() => check.exec("UPDATE quality_workdays SET tolerated = 9999"), /CHECK/);
    assert.throws(() => check.exec("UPDATE quality_workdays SET hours = 0"), /CHECK/);
    assert.throws(() => check.exec("UPDATE quality_workdays SET approved = 1.5"), /INTEGER/);
    check.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
