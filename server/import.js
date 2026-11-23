import { readWorkbook } from './xlsx.js';
import { DEFECT_FIELDS, ORIGIN_FIELDS, NON_ORIGIN_FIELD, validateBoxControlBatch } from './box-control.js';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const dailyColumns = {
  date: 'Fecha', table: 'Mesa', staff: 'Personal Operativo', hours: 'Horas trabajadas',
  approved: 'Cajas aprobadas', blocked: 'Cajas bloqueadas',
};
const detailColumns = {
  date: 'Fecha', piece: 'Tipo de pieza',
  ...Object.fromEntries(DEFECT_FIELDS.map(field => [field.key, field.label])),
  originTotal: 'Total Origen', nonOriginTotal: 'Total No Origen',
};
const clean = value => String(value ?? '').trim();
function number(value, label, row, sheet, blankIsZero = false) {
  if (blankIsZero && clean(value) === '') return 0;
  if (!['number', 'string'].includes(typeof value) || clean(value) === '') {
    fail(`Fila ${row} de ${sheet}: falta un número en «${label}».`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`Fila ${row} de ${sheet}: valor inválido en «${label}».`);
  return n;
}
function dateValue(value, row, sheet, date1904) {
  if (typeof value !== 'number') return clean(value);
  if (!Number.isInteger(value) || value < 0 || value > 2958465) fail(`Fila ${row} de ${sheet}: fecha Excel inválida.`);
  const origin = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(origin + value * 86400000).toISOString().slice(0, 10);
}
function headersFor(rows, columns, sheet) {
  if (!rows?.length) fail(`Falta la hoja ${sheet} o está vacía.`);
  const headers = new Map();
  for (const [column, value] of Object.entries(rows[0].cells)) {
    const label = clean(value);
    if (!label) continue;
    if (headers.has(label)) fail(`Columna repetida «${label}» en ${sheet}.`);
    headers.set(label, column);
  }
  for (const label of Object.values(columns)) {
    if (!headers.has(label)) fail(`Falta la columna «${label}» en ${sheet}.`);
  }
  return headers;
}

export async function parseQualityWorkbook(buffer) {
  let sheets;
  try { sheets = await readWorkbook(buffer); }
  catch (error) { fail(error.message); }
  const dailyRows = sheets.get('CONTROL_DIARIO');
  const dailyHeaders = headersFor(dailyRows, dailyColumns, 'CONTROL_DIARIO');
  const records = dailyRows.slice(1).map(row => {
    const record = { row: row.number };
    for (const [field, label] of Object.entries(dailyColumns)) {
      const value = row.cells[dailyHeaders.get(label)];
      if (field === 'date') {
        record[field] = dateValue(value, row.number, 'CONTROL_DIARIO', sheets.date1904);
      } else if (field === 'table') {
        record[field] = clean(value);
      } else {
        record[field] = number(value, label, row.number, 'CONTROL_DIARIO');
      }
    }
    return record;
  });
  const detailProvided = sheets.has('Detalle');
  const details = [];
  if (detailProvided) {
    const detailRows = sheets.get('Detalle');
    const detailHeaders = headersFor(detailRows, detailColumns, 'Detalle');
    for (const row of detailRows.slice(1)) {
      const detail = { row: row.number };
      for (const [field, label] of Object.entries(detailColumns)) {
        const value = row.cells[detailHeaders.get(label)];
        if (field === 'date') {
          detail[field] = dateValue(value, row.number, 'Detalle', sheets.date1904);
        } else if (field === 'piece') {
          detail[field] = clean(value);
        } else {
          const category = DEFECT_FIELDS.some(item => item.key === field);
          detail[field] = number(value, label, row.number, 'Detalle', category);
        }
      }
      const origin = ORIGIN_FIELDS.reduce((sum, field) => sum + detail[field.key], 0);
      if (detail.originTotal !== origin || detail.nonOriginTotal !== detail[NON_ORIGIN_FIELD.key]) {
        fail(`Fila ${row.number} de Detalle: los totales no coinciden con las categorías.`);
      }
      details.push(detail);
    }
  }
  validateBoxControlBatch(records, details);
  return { records, details, detailProvided };
}
