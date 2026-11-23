export class DuplicateRecordError extends Error {
  constructor(message = 'Ya existe una jornada de mesa o un detalle de pieza para esa fecha. No se importó ninguna fila.') { super(message); this.name = 'DuplicateRecordError'; }
}

export async function createRepository(config = process.env) {
  const adapter = config.DATABASE_ADAPTER || 'sqlite';
  if (adapter === 'sqlite') {
    const { createSqliteRepository } = await import('./sqlite.js');
    return createSqliteRepository(config.BELLIA_SQLITE_PATH || './data/bellia.db');
  }
  if (adapter === 'oracle') {
    const { createOracleRepository } = await import('./oracle.js');
    return createOracleRepository(config);
  }
  throw new Error(`Adaptador desconocido: ${adapter}`);
}
