import express from 'express';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { DuplicateDateError } from './db/index.js';
import { hashPassword, verifyPassword, newSessionToken, tokenHash, publicUser } from './security.js';
import { parseKpiWorkbook, createTemplate } from './import.js';

const DAY = 24 * 60 * 60 * 1000;
const bad = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const dateOk = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function createApp(repo) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', async (req, _res, next) => {
    try {
      const match = req.headers.cookie?.match(/(?:^|;\s*)mp_session=([a-f0-9]{64})(?:;|$)/);
      if (match) {
        const session = await repo.getSession(tokenHash(match[1]));
        if (session && session.expiresAt > new Date().toISOString()) {
          req.user = await repo.getUserById(session.userId);
          req.sessionToken = match[1];
        }
      }
      next();
    } catch (error) { next(error); }
  });
  const requireAuth = (req, _res, next) => req.user ? next() : next(Object.assign(new Error('Inicia sesión para continuar.'), { status: 401 }));
  const requireAdmin = (req, _res, next) => req.user?.role === 'admin' ? next() : next(Object.assign(new Error('No tienes permiso para esta acción.'), { status: 403 }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = await repo.getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) bad('Correo o contraseña incorrectos.', 401);
    const token = newSessionToken();
    await repo.createSession(tokenHash(token), user.id, new Date(Date.now() + 7 * DAY).toISOString());
    res.cookie('mp_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * DAY });
    res.json({ user: publicUser(user) });
  }));
  app.post('/api/auth/logout', requireAuth, asyncRoute(async (req, res) => {
    await repo.deleteSession(tokenHash(req.sessionToken));
    res.clearCookie('mp_session', { path: '/' });
    res.json({ ok: true });
  }));

  app.get('/api/kpis', requireAuth, asyncRoute(async (req, res) => {
    const to = String(req.query.to || new Date().toISOString().slice(0, 10));
    const from = String(req.query.from || new Date(Date.now() - 29 * DAY).toISOString().slice(0, 10));
    if (!dateOk(from) || !dateOk(to) || from > to) bad('Selecciona un rango de fechas válido.');
    res.json({ reports: await repo.listReports(from, to) });
  }));
  app.get('/api/users', requireAuth, requireAdmin, asyncRoute(async (_req, res) => res.json({ users: await repo.listUsers() })));
  app.post('/api/users', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = req.body?.role === 'admin' ? 'admin' : 'viewer';
    if (name.length < 2 || name.length > 100 || !emailOk(email) || email.length > 255 || password.length < 10) bad('Ingresa nombre, correo válido y contraseña de al menos 10 caracteres.');
    if (await repo.getUserByEmail(email)) bad('Ya existe una cuenta con ese correo.', 409);
    const user = { id: randomUUID(), name, email, passwordHash: await hashPassword(password), role, createdAt: new Date().toISOString() };
    try { await repo.createUser(user); }
    catch (error) { if (error.message?.includes('UNIQUE') || error.errorNum === 1) bad('Ya existe una cuenta con ese correo.', 409); throw error; }
    res.status(201).json({ user: publicUser(user) });
  }));
  app.get('/api/template', requireAuth, requireAdmin, asyncRoute(async (_req, res) => {
    const buffer = await createTemplate();
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-kpis.xlsx"');
    res.send(Buffer.from(buffer));
  }));
  app.post('/api/uploads', requireAuth, requireAdmin,
    express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '2mb' }),
    asyncRoute(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length) bad('Selecciona un archivo .xlsx válido.');
      const { date, metrics } = await parseKpiWorkbook(req.body);
      const sourceName = String(req.headers['x-file-name'] || 'indicadores.xlsx').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 100);
      await repo.insertReport({ date, metrics, uploadedBy: req.user.id, sourceName });
      res.status(201).json({ date, metricCount: metrics.length });
    }));

  if (existsSync(resolve('dist'))) app.use(express.static(resolve('dist')));
  app.use('/api', (_req, _res, next) => next(Object.assign(new Error('Ruta no encontrada.'), { status: 404 })));
  app.use((error, _req, res, _next) => {
    const status = error instanceof DuplicateDateError ? 409 : error.status || (error.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Ocurrió un error interno.' : error.message });
  });
  return app;
}
