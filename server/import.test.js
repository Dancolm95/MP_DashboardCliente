import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQualityWorkbook } from './import.js';
import { exampleRecords, workbook } from './test-fixtures.js';

test('lee fechas Excel 1900/1904, decimales de horas, columnas reordenadas y ceros', async () => {
  for (const date1904 of [false, true]) {
    const xlsx = await workbook([exampleRecords()[0]], (book, sheet) => {
      book.properties.date1904 = date1904;
      sheet.getCell('A2').value = new Date('2026-11-18T00:00:00Z');
      sheet.getCell('C2').value = 2.5;
      sheet.getCell('J1').value = 'Cajas inspeccionadas';
      sheet.getCell('J2').value = { formula: 'D2+E2', result: 10 };
      const date = sheet.getCell('A2').value;
      sheet.getCell('A1').value = 'Operario'; sheet.getCell('A2').value = 'Ana';
      sheet.getCell('B1').value = 'Fecha'; sheet.getCell('B2').value = date;
    });
    const { records } = await parseQualityWorkbook(xlsx);
    assert.equal(records[0].date, '2026-11-18');
    assert.equal(records[0].hours, 2.5);
    assert.equal(records[0].major, 0);
  }
});

test('rechaza formato V1, duplicados, vacíos, fracciones, fórmulas sin resultado y balances erróneos', async () => {
  const edits = [
    (_book, sheet) => { sheet.getCell('B1').value = 'Lote / referencia'; },
    (_book, sheet) => { sheet.getCell('J1').value = 'Operario'; },
    (_book, sheet) => { sheet.getCell('C2').value = null; },
    (_book, sheet) => { sheet.getCell('D2').value = 1.5; },
    (_book, sheet) => { sheet.getCell('E2').value = true; },
    (_book, sheet) => { sheet.getCell('F2').value = { formula: '1+1' }; },
    (_book, sheet) => { sheet.getCell('J1').value = 'Cajas inspeccionadas'; sheet.getCell('J2').value = 99; },
    (_book, sheet) => { sheet.getCell('A2').value = '2026-02-30'; },
    (_book, sheet) => { sheet.addRow(sheet.getRow(2).values); },
    (_book, sheet) => { sheet.name = 'OTRA'; },
  ];
  for (const edit of edits) {
    await assert.rejects(parseQualityWorkbook(await workbook([exampleRecords()[0]], edit)), { status: 400 });
  }
  await assert.rejects(parseQualityWorkbook(await workbook([])), /entre 1 y 3000/);
});
