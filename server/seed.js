import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRepository } from './db/index.js';
import { hashPassword } from './security.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const repo = await createRepository();
try {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('Define ADMIN_EMAIL y ADMIN_PASSWORD en .env antes de ejecutar seed.');
  const email = process.env.ADMIN_EMAIL.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  let admin = await repo.getUserByEmail(email);
  if (!admin) {
    admin = { id: randomUUID(), email, name: 'Administrador', passwordHash: await hashPassword(password), role: 'admin', createdAt: new Date().toISOString() };
    await repo.createUser(admin);
    console.log(`Administrador creado: ${email}`);
  } else console.log(`Administrador existente: ${email}`);
  if (process.env.DATABASE_ADAPTER === 'oracle') {
    console.log('No se crean datos de demostración en Oracle.');
  } else {
    const today = new Date();
    for (let daysAgo = 14; daysAgo >= 1; daysAgo--) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysAgo)).toISOString().slice(0, 10);
      const existing = await repo.listReports(date, date);
      if (existing.length) continue;
      const received = 840 + ((daysAgo * 53 + 97) % 310);
      const waste = 25 + ((daysAgo * 11 + 19) % 48);
      await repo.insertReport({ date, uploadedBy: admin.id, sourceName: 'datos-de-ejemplo', isDemo: true,
        metrics: [{ key: 'total_recibido', label: 'Total recibido', value: received }, { key: 'total_mermado', label: 'Total mermado', value: waste }] });
    }
    console.log('Datos de demostración listos.');
  }
} finally { await repo.close(); }
