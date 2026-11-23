import express from 'express';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { DuplicateRecordError } from './db/index.js';
import { hashPassword, verifyPassword, newSessionToken, tokenHash, publicUser } from './security.js';
import { parseQualityWorkbook } from './import.js';
import { buildDashboard } from './quality.js';
import { validDate } from './box-control.js';

const DAY = 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE = 12 * 60 * 60 * 1000;
const SESSION_IDLE_TIMEOUT = 60 * 60 * 1000;
const LOGIN_WINDOW = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const bad = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);


export function createApp(repo, { now = () => Date.now() } = {}) {
  const app = express();
  const loginAttempts = new Map();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', async (req, res, next) => {
    try {
      const match = req.headers.cookie?.match(/(?:^|;\s*)mp_session=([a-f0-9]{64})(?:;|$)/);
      if (match) {
        const session = await repo.getSession(tokenHash(match[1]));
        const time = now();
        if (session && Date.parse(session.expiresAt) > time
          && Date.parse(session.lastActivityAt) + SESSION_IDLE_TIMEOUT > time) {
          req.user = await repo.getUserById(session.userId);
          req.sessionToken = match[1];
        } else {
          if (session) await repo.deleteSession(tokenHash(match[1]));
          res.clearCookie('mp_session', { path: '/' });
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  });
  const requireAuth = asyncRoute(async (req, _res, next) => {
    if (!req.user) return next(Object.assign(new Error('Inicia sesión para continuar.'), { status: 401 }));
    await repo.touchSession(tokenHash(req.sessionToken), new Date(now()).toISOString());
    next();
  });
  const requireAdmin = (req, _res, next) => {
    if (req.user?.role !== 'admin') {
      return next(Object.assign(new Error('No tienes permiso para esta acción.'), { status: 403 }));
    }
    next();
  };

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const time = now();
    for (const [ip, attempt] of loginAttempts) {
      if (attempt.expiresAt <= time) loginAttempts.delete(ip);
    }
    const ip = req.ip;
    const attempt = loginAttempts.get(ip);
    if (attempt?.count >= MAX_LOGIN_ATTEMPTS) {
      res.set('Retry-After', String(Math.ceil((attempt.expiresAt - time) / 1000)));
      bad('Demasiados intentos de acceso. Intenta más tarde.', 429);
    }
    if (attempt) attempt.count += 1;
    else loginAttempts.set(ip, { count: 1, expiresAt: time + LOGIN_WINDOW });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = await repo.getUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      bad('Correo o contraseña incorrectos.', 401);
    }
    const token = newSessionToken();
    const startedAt = now();
    await repo.createSession(tokenHash(token), user.id,
      new Date(startedAt + SESSION_MAX_AGE).toISOString(), new Date(startedAt).toISOString());
    loginAttempts.delete(ip);
    res.cookie('mp_session', token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    res.json({ user: publicUser(user) });
  }));
  app.post('/api/auth/logout', asyncRoute(async (req, res) => {
    if (req.sessionToken) await repo.deleteSession(tokenHash(req.sessionToken));
    res.clearCookie('mp_session', { path: '/' });
    res.json({ ok: true });
  }));

  const requireBellia = (_req, _res, next) => {
    if (repo.qualityVersion !== 3) return next(Object.assign(new Error('Bellia requiere un adaptador de base compatible.'), { status: 503 }));
    next();
  };
  app.get('/api/dashboard', requireAuth, requireBellia, asyncRoute(async (req, res) => {
    const to = String(req.query.to || new Date().toISOString().slice(0, 10));
    const from = String(req.query.from || new Date(Date.now() - 29 * DAY).toISOString().slice(0, 10));
    if (!validDate(from) || !validDate(to) || from > to) bad('Selecciona un rango de fechas válido.');
    const records = await repo.listQualityRecords(from, to);
    const details = await repo.listQualityDetails(from, to);
    res.json(buildDashboard(records, details, { table: String(req.query.table || '') }));
  }));
  app.get('/api/users', requireAuth, requireAdmin, asyncRoute(async (_req, res) => res.json({ users: await repo.listUsers() })));
  app.post('/api/users', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (req.body?.role !== undefined && req.body.role !== 'viewer') {
      bad('Solo se pueden crear cuentas de visualización.', 403);
    }
    if (name.length < 2 || name.length > 100 || !emailOk(email)
      || email.length > 255 || password.length < 8) {
      bad('Ingresa nombre, correo válido y contraseña de al menos 08 caracteres.');
    }
    if (await repo.getUserByEmail(email)) bad('Ya existe una cuenta con ese correo.', 409);
    const user = {
      id: randomUUID(), name, email, passwordHash: await hashPassword(password),
      role: 'viewer', createdAt: new Date().toISOString(),
    };
    try { await repo.createUser(user); }
    catch (error) {
      if (error.message?.includes('UNIQUE') || error.errorNum === 1) {
        bad('Ya existe una cuenta con ese correo.', 409);
      }
      throw error;
    }
    res.status(201).json({ user: publicUser(user) });
  }));
  app.delete('/api/users/:id', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      bad('Identificador de usuario inválido.');
    }
    const user = await repo.getUserById(id);
    if (!user) bad('La cuenta no existe.', 404);
    if (user.role !== 'viewer') bad('No se puede eliminar una cuenta administradora.', 403);
    if (!(await repo.deleteViewer(id))) bad('La cuenta no existe.', 404);
    res.status(204).end();
  }));
  app.post('/api/uploads', requireAuth, requireAdmin, requireBellia,
    express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '2mb' }),
    asyncRoute(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || !req.body.length) bad('Selecciona un archivo .xlsx válido.');
      const { records, details, detailProvided } = await parseQualityWorkbook(req.body);
      const sourceName = String(req.headers['x-file-name'] || 'indicadores.xlsx')
        .replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 100);
      await repo.insertQualityBatch({ records, details, detailProvided, uploadedBy: req.user.id, sourceName });
      const warningDates = detailProvided
        ? buildDashboard(records.map(row => ({ ...row, detailProvided: 1 })), details).defects.warnings
        : [];
      res.status(201).json({
        recordCount: records.length,
        detailCount: details.length,
        warningDates,
      });
    }));

  if (existsSync(resolve('dist'))) app.use(express.static(resolve('dist')));
  app.use('/api', (_req, _res, next) => next(Object.assign(new Error('Ruta no encontrada.'), { status: 404 })));
  app.use((error, _req, res, _next) => {
    const status = error instanceof DuplicateRecordError ? 409 : error.status || (error.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Ocurrió un error interno.' : error.message });
  });
  return app;
}
