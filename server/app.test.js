import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { createSqliteRepository } from './db/sqlite.js';
import { createApp } from './app.js';
import { hashPassword } from './security.js';

async function workbook(rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('KPIs diarios');
  rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('login, permisos, carga Excel y fecha duplicada', async () => {
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
    assert.equal((await request('/kpis')).status, 401);
    const adminCookie = await login('admin@test.local');
    const viewerCookie = await login('viewer@test.local');
    const xlsx = await workbook([['fecha', 'total_recibido', 'total_mermado'], ['2026-11-01', 100, 5]]);
    const upload = cookie => request('/uploads', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'X-File-Name': 'test.xlsx' }, body: xlsx });
    assert.equal((await upload(viewerCookie)).status, 403);
    assert.equal((await request('/users', { headers: { Cookie: viewerCookie } })).status, 403);
    assert.equal((await upload(adminCookie)).status, 201);
    const recordsRes = await request('/kpis?from=2026-11-01&to=2026-11-30', { headers: { Cookie: viewerCookie } });
    assert.equal(recordsRes.status, 200);
    const records = await recordsRes.json();
    assert.equal(records.reports.length, 1);
    assert.equal(records.reports[0].metrics[0].value, 5);
    assert.equal((await upload(adminCookie)).status, 409);
    assert.equal((await request('/kpis?from=2026-11-01&to=2026-11-30', { headers: { Cookie: adminCookie } }).then(r => r.json())).reports.length, 1);
    const invalid = await workbook([['fecha', 'total_recibido'], ['2026-11-02', 'no es número']]);
    assert.equal((await request('/uploads', { method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: invalid })).status, 400);
    const newUser = await request('/users', { method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New User', email: 'new@test.local', password: 'Password123!', role: 'viewer' }) });
    assert.equal(newUser.status, 201);
    assert.equal((await request('/auth/logout', { method: 'POST', headers: { Cookie: viewerCookie } })).status, 200);
    assert.equal((await request('/kpis', { headers: { Cookie: viewerCookie } })).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await repo.close();
  }
});
