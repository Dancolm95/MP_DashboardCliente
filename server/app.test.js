import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { exampleRecords, exampleDetails, workbook } from './test-fixtures.js';
import { createSqliteRepository } from './db/sqlite.js';
import { createApp } from './app.js';
import { hashPassword, tokenHash } from './security.js';

async function withServer(run, options) {
  const repo = createSqliteRepository(':memory:');
  const password = 'ExamplePass123!';
  await repo.createUser({
    id: randomUUID(), email: 'admin@test.local', name: 'Admin',
    passwordHash: await hashPassword(password), role: 'admin',
    createdAt: new Date().toISOString(),
  });
  await repo.createUser({
    id: randomUUID(), email: 'viewer@test.local', name: 'Viewer',
    passwordHash: await hashPassword(password), role: 'viewer',
    createdAt: new Date().toISOString(),
  });
  const server = createApp(repo, options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(`${base}/api${path}`, options);
  const login = async email => {
    const response = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  try { await run({ repo, request, login, password }); }
  finally {
    await new Promise(resolve => server.close(resolve));
    await repo.close();
  }
}

const createUser = (request, cookie, body) => request('/users', {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const upload = (request, cookie, xlsx) => request('/uploads', {
  method: 'POST',
  headers: {
    Cookie: cookie,
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'X-File-Name': 'control.xlsx',
  },
  body: xlsx,
});
const dashboard = (request, cookie, query) => request(`/dashboard?${query}`, {
  headers: { Cookie: cookie },
}).then(response => response.json());

test('login, permisos y cierre de sesión', async () => {
  await withServer(async ({ repo, request, login, password }) => {
    assert.equal((await request('/dashboard')).status, 401);
    const admin = await login('admin@test.local');
    const viewer = await login('viewer@test.local');
    assert.equal((await request('/users', { headers: { Cookie: viewer } })).status, 403);
    assert.equal((await request('/template', { headers: { Cookie: admin } })).status, 404);

    const newUser = { name: 'New Viewer', email: 'new@test.local', password: 'Password123!' };
    assert.equal((await createUser(request, viewer, newUser)).status, 403);
    assert.equal((await createUser(request, admin, { ...newUser, role: 'admin' })).status, 403);
    const created = await createUser(request, admin, newUser);
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user.role, 'viewer');
    assert.equal((await repo.listUsers()).filter(user => user.role === 'admin').length, 1);

    const adminId = (await repo.getUserByEmail('admin@test.local')).id;
    const viewerId = (await repo.getUserByEmail('viewer@test.local')).id;
    const remove = (cookie, id) => request(`/users/${id}`, {
      method: 'DELETE', headers: { Cookie: cookie },
    });
    assert.equal((await request(`/users/${viewerId}`, { method: 'DELETE' })).status, 401);
    assert.equal((await remove(viewer, viewerId)).status, 403);
    assert.equal((await remove(admin, adminId)).status, 403);
    assert.equal((await remove(admin, 'invalid-id')).status, 400);
    assert.equal((await remove(admin, randomUUID())).status, 404);
    assert.ok(await repo.getUserById(adminId));

    assert.equal((await request('/auth/logout', {
      method: 'POST', headers: { Cookie: viewer },
    })).status, 200);
    assert.equal((await request('/dashboard', { headers: { Cookie: viewer } })).status, 401);
    assert.equal((await request('/auth/me', { headers: { Cookie: viewer } })).status, 401);

    const activeViewer = await login('viewer@test.local');
    assert.equal((await remove(admin, viewerId)).status, 204);
    assert.equal(await repo.getUserById(viewerId), null);
    assert.equal((await request('/auth/me', { headers: { Cookie: activeViewer } })).status, 401);
    assert.equal((await request('/dashboard', { headers: { Cookie: activeViewer } })).status, 401);
    assert.equal((await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'viewer@test.local', password }),
    })).status, 401);
    assert.equal((await remove(admin, viewerId)).status, 404);
  });
});

test('la cookie no persiste y el cierre de sesión revoca el acceso anterior', async () => {
  await withServer(async ({ request, login, password }) => {
    const response = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.local', password }),
    });
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.doesNotMatch(setCookie, /(?:max-age|expires)=/i);
    const cookie = setCookie.split(';')[0];
    assert.equal((await request('/auth/me', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await request('/auth/logout', {
      method: 'POST', headers: { Cookie: cookie },
    })).status, 200);
    assert.equal((await request('/auth/me', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await request('/auth/logout', { method: 'POST' })).status, 200);
    const freshCookie = await login('admin@test.local');
    assert.equal((await request('/auth/me', { headers: { Cookie: freshCookie } })).status, 200);
  });
});

test('Excel Bellia llega a indicadores; sesión, permisos, filtros y duplicados', async () => {
  await withServer(async ({ repo, request, login }) => {
    const admin = await login('admin@test.local');
    const viewer = await login('viewer@test.local');
    const query = 'from=2026-11-01&to=2026-11-30';
    const empty = await dashboard(request, viewer, query);
    assert.equal(empty.records.length, 0);
    assert.equal(empty.summary.productivity, 0);
    assert.equal(empty.summary.approvalRate, 0);
    const xlsx = await workbook();
    assert.equal((await request('/uploads', { method: 'POST', body: xlsx })).status, 401);
    assert.equal((await upload(request, viewer, xlsx)).status, 403);
    assert.equal((await upload(request, admin, Buffer.from('invalid'))).status, 400);
    const added = await upload(request, admin, xlsx);
    assert.equal(added.status, 201);
    assert.deepEqual(await added.json(), { recordCount: 3, detailCount: 3, warningDates: [] });
    const full = await dashboard(request, viewer, query);
    assert.equal(full.summary.inspected, 255);
    assert.equal(full.summary.required, 500);
    assert.equal(full.summary.attainmentRate, 51);
    assert.equal(full.summary.sets, 510);
    assert.equal(full.summary.approved, 235);
    assert.equal(full.summary.blocked, 20);
    assert.equal(full.summary.targetMet, 0);
    assert.equal(full.summary.productivity, 255 / 26);
    assert.equal(full.defects.total, 40);
    assert.deepEqual(full.defects.warnings, []);
    const filtered = await dashboard(request, viewer, `${query}&table=Mesa%202`);
    assert.equal(filtered.summary.inspected, 55);
    assert.equal(filtered.summary.required, 150);
    assert.equal(filtered.summary.productivity, 55 / 8);
    assert.equal(filtered.records.length, 1);
    assert.equal(filtered.defects.total, 40);
    const day = await dashboard(request, viewer, 'from=2026-11-18&to=2026-11-18&table=Mesa%201');
    assert.equal(day.summary.inspected, 100);
    assert.equal(day.summary.required, 200);
    assert.equal(day.summary.attainmentRate, 50);
    assert.equal(day.summary.workDays, 1);
    assert.equal(day.summary.targetMet, 0);
    assert.equal(day.defects.total, 30);
    const noData = await dashboard(request, viewer, `${query}&table=Nadie`);
    assert.equal(noData.records.length, 0);
    assert.equal(noData.summary.inspected, 0);
    assert.equal(noData.summary.required, 0);
    assert.equal(noData.summary.attainmentRate, 0);
    assert.equal(noData.defects.total, 40);
    const noDate = await dashboard(request, viewer, 'from=2026-10-01&to=2026-10-31');
    assert.equal(noDate.records.length, 0);
    assert.equal(noDate.defects.total, 0);
    for (const invalid of ['from=2026-02-30', 'from=2026-11-30&to=2026-11-01']) {
      assert.equal((await request(`/dashboard?${invalid}`, { headers: { Cookie: admin } })).status, 400);
    }
    // Una fila nueva antes del duplicado tampoco debe persistirse.
    const fresh = { ...exampleRecords()[0], date: '2026-11-20' };
    assert.equal((await upload(request, admin, await workbook([fresh, exampleRecords()[0]], null))).status, 409);
    assert.equal((await repo.listQualityRecords('2026-11-01', '2026-11-30')).length, 3);
  });
});

test('Excel inválido no guarda jornadas parciales y devuelve un error de fila', async () => {
  await withServer(async ({ repo, request, login }) => {
    const admin = await login('admin@test.local');
    const rows = exampleRecords();
    rows[2].hours = 7;
    const response = await upload(request, admin, await workbook(rows, null));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Fila 4/);
    assert.equal((await repo.listQualityRecords('2026-11-01', '2026-11-30')).length, 0);
  });
});

test('avisa diferencias del detalle y admite cargas sin esa hoja', async () => {
  await withServer(async ({ request, login }) => {
    const admin = await login('admin@test.local');
    const query = 'from=2026-11-01&to=2026-11-30';
    const warning = await upload(request, admin, await workbook(exampleRecords(), exampleDetails().slice(1)));
    assert.equal(warning.status, 201);
    assert.deepEqual((await warning.json()).warningDates, ['2026-11-18']);
    const withoutDetails = exampleRecords().map(row => ({ ...row, date: '2026-11-20' }));
    const added = await upload(request, admin, await workbook(withoutDetails, null));
    assert.equal(added.status, 400); // Mesa 1 aparece dos veces en la fecha nueva.
    const unique = withoutDetails.slice(0, 2);
    const optional = await upload(request, admin, await workbook(unique, null));
    assert.equal(optional.status, 201);
    assert.deepEqual((await optional.json()).warningDates, []);
    const result = await dashboard(request, admin, query);
    assert.deepEqual(result.defects.warnings, ['2026-11-18']);
    assert.equal(result.defects.total, 20);
    assert.equal(result.records.length, 5);
  });
});

test('límite de intentos de login', async t => {
  await withServer(async ({ request, password }) => {
    const tryLogin = passwordValue => request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.local', password: passwordValue }),
    });
    for (let count = 0; count < 5; count++) {
      assert.equal((await tryLogin('wrong-password')).status, 401);
    }
    const blocked = await tryLogin(password);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    const currentTime = Date.now();
    t.mock.method(Date, 'now', () => currentTime + 15 * 60 * 1000 + 1);
    assert.equal((await tryLogin(password)).status, 200);
  });
});


test('vence tras una hora inactiva; la actividad renueva solo ese plazo', async () => {
  let time = Date.parse('2026-11-20T08:00:00Z');
  const hour = 60 * 60 * 1000;
  await withServer(async ({ repo, login, request }) => {
    const cookie = await login('admin@test.local');
    const hash = tokenHash(cookie.split('=')[1]);
    const original = await repo.getSession(hash);
    assert.equal(Date.parse(original.expiresAt), time + 12 * hour);
    time += hour - 1;
    assert.equal((await request('/auth/me', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await repo.getSession(hash)).expiresAt, original.expiresAt);
    time += hour;
    assert.equal((await request('/dashboard', { headers: { Cookie: cookie } })).status, 401);
    assert.equal(await repo.getSession(hash), null);
  }, { now: () => time });
});

test('vence a las 12 horas incluso con actividad continua', async () => {
  let time = Date.parse('2026-11-20T08:00:00Z');
  const halfHour = 30 * 60 * 1000;
  await withServer(async ({ login, request }) => {
    const cookie = await login('admin@test.local');
    for (let step = 1; step < 24; step++) {
      time += halfHour;
      assert.equal((await request('/auth/me', { headers: { Cookie: cookie } })).status, 200);
    }
    time += halfHour;
    assert.equal((await request('/auth/me', { headers: { Cookie: cookie } })).status, 401);
    const fresh = await login('admin@test.local');
    assert.equal((await request('/auth/me', { headers: { Cookie: fresh } })).status, 200);
  }, { now: () => time });
});

test('rechaza sesiones antiguas sin última actividad registrada', async () => {
  await withServer(async ({ repo, request }) => {
    const token = 'a'.repeat(64);
    const user = await repo.getUserByEmail('admin@test.local');
    await repo.createSession(tokenHash(token), user.id, '2099-01-01T00:00:00.000Z', null);
    assert.equal((await request('/auth/me', { headers: { Cookie: `mp_session=${token}` } })).status, 401);
    assert.equal(await repo.getSession(tokenHash(token)), null);
  });
});
