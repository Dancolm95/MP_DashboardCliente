export class DuplicateRecordError extends Error {
  constructor() { super('El archivo contiene un registro de fecha, turno y lote que ya fue cargado. No se importó ninguna fila.'); this.name = 'DuplicateRecordError'; }
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
