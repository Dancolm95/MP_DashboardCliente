export const CLASSIFICATIONS = [
  { key: 'tolerated', label: 'Tolerado' },
  { key: 'minor', label: 'Menor' },
  { key: 'major', label: 'Mayor' },
  { key: 'critical', label: 'Crítico' },
];
export const UNITS_PER_BOX = 20;
export const validDate = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const workDayKey = row => JSON.stringify([row.date, row.operatorId]);
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function validateBoxControlBatch(records) {
  if (!Array.isArray(records) || !records.length || records.length > 3000) {
    fail('Indica entre 1 y 3000 jornadas de operario.');
  }
  const keys = new Set();
  for (const [index, row] of records.entries()) {
    const at = `Fila ${row?.row || index + 2}`;
    if (!row || !validDate(row.date)) fail(`${at}: fecha inválida.`);
    if (typeof row.operatorId !== 'string' || !row.operatorId.trim()
      || row.operatorId !== row.operatorId.trim() || row.operatorId.length > 100) {
      fail(`${at}: indica un operario de hasta 100 caracteres.`);
    }
    if (!Number.isFinite(row.hours) || row.hours <= 0 || row.hours > 24) {
      fail(`${at}: las horas trabajadas deben ser mayores que 0 y como máximo 24.`);
    }
    for (const field of ['approved', 'blocked', ...CLASSIFICATIONS.map(c => c.key)]) {
      if (!Number.isSafeInteger(row[field]) || row[field] < 0) {
        fail(`${at}: ${field} debe ser un entero no negativo.`);
      }
    }
    const inspected = row.approved + row.blocked;
    if (!Number.isSafeInteger(inspected * UNITS_PER_BOX)) fail(`${at}: cantidad de cajas demasiado grande.`);
    const observed = CLASSIFICATIONS.reduce((total, c) => total + row[c.key], 0);
    if (observed < row.blocked || observed > row.blocked * UNITS_PER_BOX) {
      fail(`${at}: las unidades observadas deben estar entre una y 20 por caja bloqueada (entre ${row.blocked} y ${row.blocked * UNITS_PER_BOX} en total).`);
    }
    const key = workDayKey(row);
    if (keys.has(key)) fail(`${at}: jornada repetida para ${row.operatorId} en ${row.date}.`);
    keys.add(key);
  }
}
