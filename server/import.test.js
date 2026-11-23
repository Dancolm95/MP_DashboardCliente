import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQualityWorkbook } from './import.js';
import { exampleRecords, exampleDetails, workbook } from './test-fixtures.js';

test('lee ambas hojas del formato Bellia', async () => {
  const data = await parseQualityWorkbook(await workbook());
  assert.equal(data.records.length, 3);
  assert.equal(data.details.length, 3);
  assert.equal(data.records[0].date, '2026-11-18');
  assert.equal(data.records[0].table, 'Mesa 1');
  assert.equal(data.records.reduce((total, row) => total + row.approved + row.blocked, 0), 255);
  assert.equal(data.details.reduce((total, row) => total + row.originTotal + row.nonOriginTotal, 0), 40);
});

test('Detalle es opcional; lee ceros vacíos y fechas Excel 1904', async () => {
  const withoutDetails = await parseQualityWorkbook(await workbook(exampleRecords(), null));
  assert.equal(withoutDetails.detailProvided, false);
  assert.deepEqual(withoutDetails.details, []);
  const withBlank = await parseQualityWorkbook(await workbook(exampleRecords(), exampleDetails(), (book, _daily, detail) => {
    book.properties.date1904 = true;
    detail.getCell('E2').value = null;
    detail.getCell('A2').value = new Date('2026-11-18T00:00:00Z');
  }));
  assert.equal(withBlank.details[0].date, '2026-11-18');
  assert.equal(withBlank.details[0].sharpBurr, 0);
});

test('rechaza columnas, duplicados, cantidades y totales incorrectos', async () => {
  const edits = [
    (_book, daily) => { daily.getCell('B1').value = 'Operario'; },
    (_book, daily) => { daily.getCell('C2').value = null; },
    (_book, daily) => { daily.getCell('C2').value = 0; },
    (_book, daily) => { daily.getCell('D2').value = 7.5; },
    (_book, daily) => { daily.getCell('E2').value = -1; },
    (_book, daily) => { daily.addRow(daily.getRow(2).values); },
    (_book, _daily, detail) => { detail.getCell('H2').value = 99; },
    (_book, _daily, detail) => { detail.getCell('J2').value = { formula: 'I2' }; },
    (_book, _daily, detail) => { detail.addRow(detail.getRow(2).values); },
  ];
  for (const edit of edits) {
    await assert.rejects(parseQualityWorkbook(await workbook(exampleRecords(), exampleDetails(), edit)), { status: 400 });
  }
});
