export const SETS_PER_BOX = 2;
export const BOXES_PER_OPERATOR = 50;
export const boxesRequired = staff => staff * BOXES_PER_OPERATOR;
export const inspectedBoxes = row => row.approved + row.blocked;
export const ORIGIN_FIELDS = [
  { key: 'brokenWithoutPiece', label: 'Roto/quiñado SIN pedazo en caja' },
  { key: 'fissure', label: 'Fisura' },
  { key: 'sharpBurr', label: 'Rebaba cortante' },
  { key: 'stain', label: 'Mancha' },
  { key: 'other', label: 'Otros' },
];
export const NON_ORIGIN_FIELD = { key: 'brokenWithPiece', label: 'Roto/quiñado CON pedazo en caja' };
export const DEFECT_FIELDS = [...ORIGIN_FIELDS, NON_ORIGIN_FIELD];
export const validDate = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const count = (value, label, at) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${at}: ${label} debe ser un entero no negativo.`);
};

export function validateBoxControlBatch(records, details = []) {
  if (!Array.isArray(records) || !records.length || records.length > 3000) {
    fail('Indica entre 1 y 3000 jornadas de mesa.');
  }
  if (!Array.isArray(details) || details.length > 3000) fail('El detalle supera 3000 filas.');
  const keys = new Set();
  for (const [index, row] of records.entries()) {
    const at = `Fila ${row?.row || index + 2} de CONTROL_DIARIO`;
    if (!row || !validDate(row.date)) fail(`${at}: fecha inválida.`);
    if (typeof row.table !== 'string' || !row.table.trim()
      || row.table !== row.table.trim() || row.table.length > 100) fail(`${at}: indica una mesa de hasta 100 caracteres.`);
    count(row.staff, 'Personal Operativo', at);
    if (row.staff === 0) fail(`${at}: Personal Operativo debe ser al menos 1.`);
    if (!Number.isSafeInteger(boxesRequired(row.staff))) fail(`${at}: Personal Operativo es demasiado grande.`);
    if (!Number.isFinite(row.hours) || row.hours < 8 || row.hours > 24) {
      fail(`${at}: las horas trabajadas deben estar entre 8 y 24.`);
    }
    count(row.approved, 'Cajas aprobadas', at);
    count(row.blocked, 'Cajas bloqueadas', at);
    if (!Number.isSafeInteger(inspectedBoxes(row) * SETS_PER_BOX)) fail(`${at}: cantidad de cajas demasiado grande.`);
    const key = JSON.stringify([row.date, row.table]);
    if (keys.has(key)) fail(`${at}: jornada repetida para ${row.table} en ${row.date}.`);
    keys.add(key);
  }
  const detailKeys = new Set();
  const dates = new Set(records.map(row => row.date));
  for (const [index, row] of details.entries()) {
    const at = `Fila ${row?.row || index + 2} de Detalle`;
    if (!row || !validDate(row.date)) fail(`${at}: fecha inválida.`);
    if (!dates.has(row.date)) fail(`${at}: la fecha no aparece en CONTROL_DIARIO.`);
    if (typeof row.piece !== 'string' || !row.piece.trim()
      || row.piece !== row.piece.trim() || row.piece.length > 100) fail(`${at}: indica un tipo de pieza de hasta 100 caracteres.`);
    for (const field of DEFECT_FIELDS) count(row[field.key], field.label, at);
    const key = JSON.stringify([row.date, row.piece]);
    if (detailKeys.has(key)) fail(`${at}: detalle repetido para ${row.piece} en ${row.date}.`);
    detailKeys.add(key);
  }
}
