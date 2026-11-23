import ExcelJS from 'exceljs';

export const exampleRecords = () => [
  { date: '2026-11-18', table: 'Mesa 1', staff: 4, hours: 8, approved: 90, blocked: 10 },
  { date: '2026-11-18', table: 'Mesa 2', staff: 3, hours: 8, approved: 50, blocked: 5 },
  { date: '2026-11-19', table: 'Mesa 1', staff: 3, hours: 10, approved: 95, blocked: 5 },
];
export const exampleDetails = () => [
  { date: '2026-11-18', piece: 'Plato de fondo', brokenWithoutPiece: 10, fissure: 5, sharpBurr: 0, stain: 0, other: 5, brokenWithPiece: 0 },
  { date: '2026-11-18', piece: 'Taza de té', brokenWithoutPiece: 3, fissure: 1, sharpBurr: 1, stain: 0, other: 0, brokenWithPiece: 5 },
  { date: '2026-11-19', piece: 'Plato de fondo', brokenWithoutPiece: 0, fissure: 2, sharpBurr: 0, stain: 3, other: 0, brokenWithPiece: 5 },
];
const dailyHeaders = ['Fecha', 'Mesa', 'Personal Operativo', 'Horas trabajadas', 'Cajas aprobadas', 'Cajas bloqueadas'];
const detailHeaders = [
  'Fecha', 'Tipo de pieza', 'Roto/quiñado SIN pedazo en caja', 'Fisura',
  'Rebaba cortante', 'Mancha', 'Otros', 'Total Origen',
  'Roto/quiñado CON pedazo en caja', 'Total No Origen',
];
export async function workbook(records = exampleRecords(), details = exampleDetails(), edit = () => {}) {
  const book = new ExcelJS.Workbook();
  const daily = book.addWorksheet('CONTROL_DIARIO');
  daily.addRow(dailyHeaders);
  for (const row of records) daily.addRow([
    row.date, row.table, row.staff, row.hours, row.approved, row.blocked,
  ]);
  let detail;
  if (details !== null) {
    detail = book.addWorksheet('Detalle');
    detail.addRow(detailHeaders);
    for (const row of details) {
      const origin = row.brokenWithoutPiece + row.fissure + row.sharpBurr + row.stain + row.other;
      detail.addRow([
        row.date, row.piece, row.brokenWithoutPiece, row.fissure, row.sharpBurr,
        row.stain, row.other, { formula: `SUM(C${detail.rowCount + 1}:G${detail.rowCount + 1})`, result: origin },
        row.brokenWithPiece, { formula: `I${detail.rowCount + 1}`, result: row.brokenWithPiece },
      ]);
    }
  }
  edit(book, daily, detail);
  return Buffer.from(await book.xlsx.writeBuffer());
}
