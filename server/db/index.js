export class DuplicateDateError extends Error {
  constructor(date) { super(`Ya existen indicadores para el ${date}.`); this.name = 'DuplicateDateError'; }
}

export async function createRepository(config = process.env) {
  const adapter = config.DATABASE_ADAPTER || 'sqlite';
  if (adapter === 'sqlite') {
    const { createSqliteRepository } = await import('./sqlite.js');
    return createSqliteRepository(config.SQLITE_PATH || './data/dashboard.db');
  }
  if (adapter === 'oracle') {
    const { createOracleRepository } = await import('./oracle.js');
    return createOracleRepository(config);
  }
  throw new Error(`Adaptador desconocido: ${adapter}`);
}
