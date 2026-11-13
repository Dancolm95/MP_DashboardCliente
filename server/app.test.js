import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { createSqliteRepository } from './db/sqlite.js';
import { createApp } from './app.js';
import { hashPassword } from './security.js';

async function workbook() {
  const book = new ExcelJS.Workbook();
  const control = book.addWorksheet('CONTROL_DIARIO');
  control.addRow(['Fecha', 'Turno', 'Lote / referencia', 'Producto', 'Cajas recibidas', 'Pendientes iniciales', 'Cajas inspeccionadas', 'Cajas aprobadas', 'Cajas rechazadas', 'Cajas con merma*', 'Pendientes finales', 'Personal asignado', 'Horas efectivas / persona']);
  control.addRow(['2026-11-02', 'Día', 'L-001', 'Vajillas', 20, 0, 15, 12, 3, 1, 5, 2, 8]);
  control.addRow(['2026-11-03', 'Tarde', 'L-002', 'Platos', 10, 5, 12, 10, 2, 1, 3, 2, 8]);
  const incidents = book.addWorksheet('INCIDENCIAS');
  incidents.addRow(['Fecha', 'Lote / referencia', 'Producto', 'Tipo de defecto', 'Cajas afectadas', 'Acción / destino', 'Observación', 'Responsable']);
  incidents.addRow(['2026-11-02', 'L-001', 'Vajillas', 'Rotura', 2, 'Merma', '', 'Supervisor']);
  incidents.addRow(['2026-11-03', 'L-002', 'Platos', 'Fisura', 1, 'Reproceso', '', 'Supervisor']);
  const summary = book.addWorksheet('RESUMEN_KPI');
  summary.addRow(['Indicador', 'Valor']);
  summary.addRow(['Cajas recibidas', 31]);
  summary.addRow(['Cajas inspeccionadas', 27]);
  summary.addRow(['Cajas aprobadas', 22]);
  summary.addRow(['Cajas rechazadas', 5]);
  summary.addRow(['Cajas con merma (informativo)', 2]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('login, límite de intentos, importación, filtros e incidencias', async t => {
  const repo = createSqliteRepository(':memory:');
  const password = 'ExamplePass123!';
  await repo.createUser({ id: randomUUID(), email: 'admin@test.local', name: 'Admin', passwordHash: await hashPassword(password), role: 'admin', createdAt: new Date().toISOString() });
  await repo.createUser({ id: randomUUID(), email: 'viewer@test.local', name: 'Viewer', passwordHash: await hashPassword(password), role: 'viewer', createdAt: new Date().toISOString() });
  const server = createApp(repo).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(`${base}/api${path}`, options);
  async function login(email) {
    const res = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  }
  try {
    assert.equal((await request('/dashboard')).status, 401);
    const admin = await login('admin@test.local');
    const viewer = await login('viewer@test.local');
    const empty = await request('/dashboard?from=2026-11-01&to=2026-11-30', { headers: { Cookie: viewer } }).then(r => r.json());
    assert.equal(empty.records.length, 0);
    assert.equal(empty.summary.pendingEnd, null);
    const xlsx = await workbook();
    const upload = cookie => request('/uploads', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'X-File-Name': 'control.xlsx' }, body: xlsx });
    assert.equal((await upload(viewer)).status, 403);
    assert.equal((await request('/users', { headers: { Cookie: viewer } })).status, 403);
    const newUser = { name: 'New Viewer', email: 'new@test.local', password: 'Password123!' };
    const createUser = (cookie, body) => request('/users', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await createUser(viewer, newUser)).status, 403);
    assert.equal((await createUser(admin, { ...newUser, role: 'admin' })).status, 403);
    const created = await createUser(admin, newUser);
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user.role, 'viewer');
    assert.equal((await repo.listUsers()).filter(user => user.role === 'admin').length, 1);
    assert.equal((await request('/template', { headers: { Cookie: admin } })).status, 404);
    const added = await upload(admin);
    assert.equal(added.status, 201);
    const result = await added.json();
    assert.equal(result.recordCount, 2);
    assert.equal(result.incidentCount, 2);
    assert.equal(result.warnings.length, 1);
    const dashboard = await request('/dashboard?from=2026-11-01&to=2026-11-30', { headers: { Cookie: viewer } }).then(r => r.json());
    assert.equal(dashboard.summary.received, 30);
    assert.equal(dashboard.summary.inspected, 27);
    assert.equal(dashboard.summary.approved, 22);
    assert.equal(dashboard.summary.rejected, 5);
    assert.equal(dashboard.summary.approvalRate, 22 / 27 * 100);
    assert.equal(dashboard.summary.pendingEnd, 3);
    assert.deepEqual(
      dashboard.records.map(({ received, pendingStart, inspected, pendingEnd }) => ({ received, pendingStart, inspected, pendingEnd })),
      [
        { received: 10, pendingStart: 5, inspected: 12, pendingEnd: 3 },
        { received: 20, pendingStart: 0, inspected: 15, pendingEnd: 5 },
      ],
    );
    assert.equal(dashboard.incidents.length, 2);
    assert.deepEqual(dashboard.byShift.map(({ name, received, pendingStart, inspected }) => ({ name, received, pendingStart, inspected })), [
      { name: 'Día', received: 20, pendingStart: 0, inspected: 15 },
      { name: 'Tarde', received: 10, pendingStart: 5, inspected: 12 },
    ]);
    const filtered = await request('/dashboard?from=2026-11-01&to=2026-11-30&shift=D%C3%ADa&product=Vajillas', { headers: { Cookie: viewer } }).then(r => r.json());
    assert.equal(filtered.summary.received, 20);
    assert.equal(filtered.summary.pendingEnd, 3);
    assert.equal(filtered.incidents.length, 1);
    assert.equal((await upload(admin)).status, 409);
    assert.equal((await repo.listQualityRecords('2026-11-01', '2026-11-30')).length, 2);
    assert.equal((await request('/auth/logout', { method: 'POST', headers: { Cookie: viewer } })).status, 200);
    assert.equal((await request('/dashboard', { headers: { Cookie: viewer } })).status, 401);
    assert.equal((await request('/auth/me', { headers: { Cookie: viewer } })).status, 401);
    const tryLogin = password => request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password }) });
    for (let count = 0; count < 5; count++) assert.equal((await tryLogin('wrong-password')).status, 401);
    const blocked = await tryLogin(password);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    const currentTime = Date.now();
    t.mock.method(Date, 'now', () => currentTime + 15 * 60 * 1000 + 1);
    assert.equal((await tryLogin(password)).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await repo.close();
  }
});
