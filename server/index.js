import { existsSync } from 'node:fs';
import { createRepository } from './db/index.js';
import { createApp } from './app.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const repo = await createRepository();
const port = Number(process.env.PORT || 3001);
const server = createApp(repo).listen(port, '127.0.0.1', () => console.log(`API lista en http://127.0.0.1:${port}`));
async function shutdown() { server.close(); await repo.close(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
