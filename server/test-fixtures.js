import ExcelJS from 'exceljs';

// Ana: (10 + 30) / (2 + 6) = 5 cajas/h; Luis: 20 / 2 = 10 cajas/h.
export const exampleRecords = () => [
  { date: '2026-11-18', operatorId: 'Ana', hours: 2, approved: 8, blocked: 2, tolerated: 1, minor: 2, major: 0, critical: 1 },
  { date: '2026-11-18', operatorId: 'Luis', hours: 2, approved: 19, blocked: 1, tolerated: 0, minor: 0, major: 1, critical: 0 },
  { date: '2026-11-19', operatorId: 'Ana', hours: 6, approved: 27, blocked: 3, tolerated: 2, minor: 1, major: 2, critical: 1 },
];
export const headers = ['Fecha', 'Operario', 'Horas trabajadas', 'Cajas aprobadas', 'Cajas bloqueadas', 'Tolerado', 'Menor', 'Mayor', 'Crítico'];
export async function workbook(records = exampleRecords(), edit = () => {}) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('CONTROL_DIARIO');
  sheet.addRow(headers);
  for (const row of records) sheet.addRow([
    row.date, row.operatorId, row.hours, row.approved, row.blocked,
    row.tolerated, row.minor, row.major, row.critical,
  ]);
  edit(book, sheet);
  return Buffer.from(await book.xlsx.writeBuffer());
}
