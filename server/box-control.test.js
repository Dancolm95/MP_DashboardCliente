import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteRepository } from './db/sqlite.js';
import { summarizeBoxControl } from './box-control.js';

const detail = (classificationId, quantity) => ({ classificationId, quantity });
const box = (code, operatorId, initial, final) => ({
  code, operatorId, date: '2026-11-18', inicial: initial, cierre: final,
});
const example = () => ({
  workDays: [
    { operatorId: 'Operario 01', date: '2026-11-18', hours: 4 },
    { operatorId: 'Operario 02', date: '2026-11-18', hours: 2 },
  ],
  boxes: [
    box('CAJA-001', 'Operario 01',
      { optimal: 20, details: [] }, { optimal: 20, details: [] }),
    box('CAJA-002', 'Operario 01',
      { optimal: 10, details: [detail('TOLERADO', 10)] },
      { optimal: 20, details: [] }),
    box('CAJA-003', 'Operario 02',
      { optimal: 10, details: [detail('CRITICO', 10)] },
      { optimal: 0, details: [detail('TOLERADO', 10), detail('CRITICO', 10)] }),
  ],
});

async function withRepo(run) {
  const repo = createSqliteRepository(':memory:');
  try { await run(repo); }
  finally { await repo.close(); }
}

test('cajas iniciales, cierre y productividad por operario', async () => {
  await withRepo(async repo => {
    await repo.createOperator('Operario 01');
    await repo.createOperator('Operario 02');
    await repo.insertBoxControlBatch(example());
    const data = await repo.listBoxControl('2026-11-18', '2026-11-18');
    const result = summarizeBoxControl(data.workDays, data.boxes);
    assert.deepEqual(result.summary, {
      boxes: 3, initialApproved: 1, initialBlocked: 2,
      finalApproved: 2, finalBlocked: 1,
    });
    assert.deepEqual(result.operators, [
      { operatorId: 'Operario 01', hoursWorked: 4, boxesReviewed: 2, boxesPerHour: 0.5 },
      { operatorId: 'Operario 02', hoursWorked: 2, boxesReviewed: 1, boxesPerHour: 0.5 },
    ]);
    assert.deepEqual(data.boxes[2].cierre.details, [
      detail('CRITICO', 10), detail('TOLERADO', 10),
    ]);
    assert.deepEqual(await repo.listBoxControl('2026-11-17', '2026-11-17'), {
      workDays: [], boxes: [],
    });
  });
});

test('rechaza horas y composiciones inválidas sin guardar datos parciales', async () => {
  await withRepo(async repo => {
    await repo.createOperator('Operario 01');
    await repo.createOperator('Operario 02');
    const invalidBatches = [
      batch => { batch.workDays[0].hours = 0; },
      batch => { delete batch.workDays[0].hours; },
      batch => { batch.boxes[0].inicial.optimal = 19; },
      batch => { batch.boxes[1].inicial.details[0].quantity = -1; },
      batch => { batch.boxes[1].inicial.details[0].classificationId = 'DESCONOCIDO'; },
      batch => { batch.boxes[1].cierre.optimal = 19; },
      batch => { batch.boxes[2].cierre.details[0].quantity = 9; },
      batch => { batch.boxes[1].code = 'CAJA-001'; },
    ];
    for (const mutate of invalidBatches) {
      const batch = example();
      mutate(batch);
      await assert.rejects(repo.insertBoxControlBatch(batch));
      assert.equal((await repo.listBoxControl('2026-11-18', '2026-11-18')).boxes.length, 0);
    }
    const missingOperator = example();
    missingOperator.workDays[1].operatorId = 'Operario 03';
    missingOperator.boxes[2].operatorId = 'Operario 03';
    await assert.rejects(repo.insertBoxControlBatch(missingOperator), /FOREIGN KEY/);
    assert.equal((await repo.listBoxControl('2026-11-18', '2026-11-18')).boxes.length, 0);
  });
});

test('código de caja único global y carga atómica', async () => {
  await withRepo(async repo => {
    await repo.createOperator('Operario 01');
    await repo.createOperator('Operario 02');
    await repo.insertBoxControlBatch(example());
    const duplicate = {
      workDays: [{ operatorId: 'Operario 01', date: '2026-11-19', hours: 1 }],
      boxes: [box('CAJA-001', 'Operario 01',
        { optimal: 20, details: [] }, { optimal: 20, details: [] })],
    };
    duplicate.boxes[0].date = '2026-11-19';
    await assert.rejects(repo.insertBoxControlBatch(duplicate), /UNIQUE/);
    const nextDay = await repo.listBoxControl('2026-11-19', '2026-11-19');
    assert.deepEqual(nextDay, { workDays: [], boxes: [] });
    assert.equal((await repo.listBoxControl('2026-11-18', '2026-11-18')).boxes.length, 3);
  });
});
