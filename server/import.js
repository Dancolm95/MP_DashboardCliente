import { readWorkbook } from './xlsx.js';

const fail = (message) => { const error = new Error(message); error.status = 400; throw error; };
const requiredControl = ['Fecha', 'Turno', 'Lote / referencia', 'Producto', 'Cajas recibidas', 'Pendientes iniciales', 'Cajas inspeccionadas', 'Cajas aprobadas', 'Cajas rechazadas', 'Cajas con merma*', 'Pendientes finales', 'Personal asignado', 'Horas efectivas / persona'];
const requiredIncident = ['Fecha', 'Lote / referencia', 'Producto', 'Tipo de defecto', 'Cajas afectadas', 'Acción / destino', 'Observación', 'Responsable'];
const clean = value => String(value ?? '').trim();
const number = (value, field, row) => {
  if (clean(value) === '') fail(`${field}: falta el valor en fila ${row}.`);
  const n = typeof value === 'number' ? value : Number(clean(value));
  if (!Number.isFinite(n) || n < 0) fail(`${field}: valor inválido en fila ${row}.`);
  return n;
};
const dateValue = (value, row) => {
  let text = clean(value);
  if (typeof value === 'number') text = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) fail(`Fecha inválida en fila ${row}.`);
  return text;
};
function objectRows(rows, required, sheetName) {
  if (!rows?.length) fail(`Falta la hoja ${sheetName} o está vacía.`);
  const headers = rows[0].cells;
  const columns = new Map(Object.entries(headers).map(([column, label]) => [clean(label), column]));
  for (const name of required) if (!columns.has(name)) fail(`Falta la columna «${name}» en ${sheetName}.`);
  return rows.slice(1).map(row => ({ row: row.number, get: name => row.cells[columns.get(name)] }));
}

export async function parseQualityWorkbook(buffer) {
  let sheets;
  try { sheets = await readWorkbook(buffer); }
  catch (error) { fail(error.message); }
  const controlRows = objectRows(sheets.get('CONTROL_DIARIO'), requiredControl, 'CONTROL_DIARIO');
  if (!controlRows.length) fail('CONTROL_DIARIO no tiene registros.');
  if (controlRows.length > 3000) fail('El archivo excede 3000 registros de control.');
  const records = [];
  const keys = new Set();
  for (const row of controlRows) {
    const date = dateValue(row.get('Fecha'), row.row);
    const shift = clean(row.get('Turno'));
    const lot = clean(row.get('Lote / referencia'));
    const product = clean(row.get('Producto'));
    if (!shift || !lot || !product) fail(`Faltan turno, lote o producto en CONTROL_DIARIO fila ${row.row}.`);
    const key = `${date}|${shift.toLowerCase()}|${lot.toLowerCase()}`;
    if (keys.has(key)) fail(`Registro repetido en CONTROL_DIARIO fila ${row.row}: ${date}, ${shift}, ${lot}.`);
    keys.add(key);
    const received = number(row.get('Cajas recibidas'), 'Cajas recibidas', row.row);
    const pendingStart = number(row.get('Pendientes iniciales'), 'Pendientes iniciales', row.row);
    const inspected = number(row.get('Cajas inspeccionadas'), 'Cajas inspeccionadas', row.row);
    const approved = number(row.get('Cajas aprobadas'), 'Cajas aprobadas', row.row);
    const rejected = number(row.get('Cajas rechazadas'), 'Cajas rechazadas', row.row);
    const waste = number(row.get('Cajas con merma*'), 'Cajas con merma', row.row);
    const pendingEnd = number(row.get('Pendientes finales'), 'Pendientes finales', row.row);
    const staff = number(row.get('Personal asignado'), 'Personal asignado', row.row);
    const hoursPerPerson = number(row.get('Horas efectivas / persona'), 'Horas efectivas', row.row);
    if (approved + rejected !== inspected) fail(`El balance de cajas no cierra en CONTROL_DIARIO fila ${row.row}.`);
    if (received + pendingStart - inspected !== pendingEnd) fail(`El saldo pendiente no cierra en CONTROL_DIARIO fila ${row.row}.`);
    records.push({ date, shift, lot, product, received, pendingStart, inspected, approved, rejected, waste, pendingEnd, staff, hoursPerPerson, observations: clean(row.get('Observaciones')), row: row.row });
  }
  const incidentRows = objectRows(sheets.get('INCIDENCIAS'), requiredIncident, 'INCIDENCIAS');
  if (incidentRows.length > 5000) fail('El archivo excede 5000 incidencias.');
  const incidents = incidentRows.map(row => {
    const date = dateValue(row.get('Fecha'), row.row);
    const lot = clean(row.get('Lote / referencia'));
    const matches = records.filter(record => record.date === date && record.lot === lot);
    if (matches.length !== 1) fail(`La incidencia de la fila ${row.row} no tiene un lote y fecha únicos en CONTROL_DIARIO.`);
    if (clean(row.get('Producto')) !== matches[0].product) fail(`El producto de INCIDENCIAS fila ${row.row} no coincide con CONTROL_DIARIO.`);
    return { date, lot, product: clean(row.get('Producto')), defect: clean(row.get('Tipo de defecto')), affected: number(row.get('Cajas afectadas'), 'Cajas afectadas', row.row), action: clean(row.get('Acción / destino')), observation: clean(row.get('Observación')), responsible: clean(row.get('Responsable')), recordKey: `${date}|${matches[0].shift.toLowerCase()}|${lot.toLowerCase()}` };
  });
  const summaryRows = objectRows(sheets.get('RESUMEN_KPI'), ['Indicador', 'Valor'], 'RESUMEN_KPI');
  const sourceTotals = Object.fromEntries(summaryRows.filter(row => clean(row.get('Valor')) !== '').map(row => [clean(row.get('Indicador')), Number(row.get('Valor'))]));
  const totals = { 'Cajas recibidas': records.reduce((n, r) => n + r.received, 0), 'Cajas inspeccionadas': records.reduce((n, r) => n + r.inspected, 0), 'Cajas aprobadas': records.reduce((n, r) => n + r.approved, 0), 'Cajas rechazadas': records.reduce((n, r) => n + r.rejected, 0), 'Cajas con merma (informativo)': records.reduce((n, r) => n + r.waste, 0) };
  const warnings = Object.entries(totals).filter(([label, value]) => Number.isFinite(sourceTotals[label]) && Math.abs(sourceTotals[label] - value) > 0.01).map(([label, value]) => `${label}: detalle ${value}, resumen ${sourceTotals[label]}.`);
  return { records, incidents, warnings };
}
