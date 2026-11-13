import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRepository } from './db/index.js';
import { hashPassword } from './security.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const repo = await createRepository();
try {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'REPLACE_WITH_A_LOCAL_PASSWORD') throw new Error('Define ADMIN_EMAIL y una ADMIN_PASSWORD local en .env antes de ejecutar seed.');
  const email = process.env.ADMIN_EMAIL.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  let admin = await repo.getUserByEmail(email);
  if (!admin) {
    admin = { id: randomUUID(), email, name: 'Administrador', passwordHash: await hashPassword(password), role: 'admin', createdAt: new Date().toISOString() };
    await repo.createUser(admin);
    console.log(`Administrador creado: ${email}`);
  } else console.log(`Administrador existente: ${email}`);
  console.log('Dashboard listo para la primera carga de Excel.');
} finally { await repo.close(); }
