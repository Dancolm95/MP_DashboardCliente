import { readWorkbook } from './xlsx.js';
import { validateBoxControlBatch } from './box-control.js';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const columns = {
  date: 'Fecha', operatorId: 'Operario', hours: 'Horas trabajadas',
  approved: 'Cajas aprobadas', blocked: 'Cajas bloqueadas',
  tolerated: 'Tolerado', minor: 'Menor', major: 'Mayor', critical: 'Crítico',
};
const clean = value => String(value ?? '').trim();
function number(value, label, row) {
  if (!['number', 'string'].includes(typeof value) || clean(value) === '') {
    fail(`Fila ${row}: falta un número en «${label}».`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`Fila ${row}: valor inválido en «${label}».`);
  return n;
}
function dateValue(value, row, date1904) {
  if (typeof value !== 'number') return clean(value);
  if (!Number.isInteger(value) || value < 0 || value > 2958465) fail(`Fila ${row}: fecha Excel inválida.`);
  const origin = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(origin + value * 86400000).toISOString().slice(0, 10);
}

export async function parseQualityWorkbook(buffer) {
  let sheets;
  try { sheets = await readWorkbook(buffer); }
  catch (error) { fail(error.message); }
  const rows = sheets.get('CONTROL_DIARIO');
  if (!rows?.length) fail('Falta la hoja CONTROL_DIARIO o está vacía.');
  const headers = new Map();
  for (const [column, value] of Object.entries(rows[0].cells)) {
    const label = clean(value);
    if (!label) continue;
    if (headers.has(label)) fail(`Columna repetida «${label}» en CONTROL_DIARIO.`);
    headers.set(label, column);
  }
  for (const label of Object.values(columns)) {
    if (!headers.has(label)) fail(`Falta la columna «${label}» en CONTROL_DIARIO (formato Calidad V2).`);
  }
  const records = rows.slice(1).map(row => {
    const record = { row: row.number };
    for (const [field, label] of Object.entries(columns)) {
      const value = row.cells[headers.get(label)];
      record[field] = field === 'date' ? dateValue(value, row.number, sheets.date1904)
        : field === 'operatorId' ? clean(value) : number(value, label, row.number);
    }
    // Si el archivo incluye el total, nunca aceptar un balance inconsistente.
    if (headers.has('Cajas inspeccionadas')) {
      const total = number(row.cells[headers.get('Cajas inspeccionadas')], 'Cajas inspeccionadas', row.number);
      if (total !== record.approved + record.blocked) fail(`Fila ${row.number}: inspeccionadas debe ser igual a aprobadas + bloqueadas.`);
    }
    return record;
  });
  validateBoxControlBatch(records);
  return { records };
}
