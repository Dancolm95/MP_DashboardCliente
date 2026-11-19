export const CLASSIFICATIONS = ['TOLERADO', 'MENOR', 'MAYOR', 'CRITICO'];
const CLASSIFICATION_SET = new Set(CLASSIFICATIONS);
const MOMENTS = ['inicial', 'cierre'];

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function requiredText(value, label, limit) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > limit) {
    throw new Error(`${label}: valor inválido.`);
  }
}

function compositionCounts(composition, code, moment) {
  if (!composition || !Number.isInteger(composition.optimal) || composition.optimal < 0 || composition.optimal > 20
    || !Array.isArray(composition.details)) {
    throw new Error(`${code}: composición ${moment} inválida.`);
  }
  const counts = Object.fromEntries(CLASSIFICATIONS.map(id => [id, 0]));
  for (const detail of composition.details) {
    if (!CLASSIFICATION_SET.has(detail?.classificationId)
      || !Number.isInteger(detail.quantity) || detail.quantity < 1 || detail.quantity > 20
      || counts[detail.classificationId] !== 0) {
      throw new Error(`${code}: detalle ${moment} inválido o repetido.`);
    }
    counts[detail.classificationId] = detail.quantity;
  }
  if (composition.optimal + Object.values(counts).reduce((sum, count) => sum + count, 0) !== 20) {
    throw new Error(`${code}: la composición ${moment} debe sumar 20 vajillas.`);
  }
  return { OPTIMO: composition.optimal, ...counts };
}

export function validateBoxControlBatch({ workDays, boxes }) {
  if (!Array.isArray(workDays) || !Array.isArray(boxes) || boxes.length === 0) {
    throw new Error('Indica jornadas y al menos una caja.');
  }
  const days = new Set();
  for (const day of workDays) {
    requiredText(day?.operatorId, 'Operario', 50);
    if (!validDate(day.date) || !Number.isFinite(day.hours) || day.hours <= 0 || day.hours > 24) {
      throw new Error('Fecha u horas trabajadas inválidas.');
    }
    const key = `${day.operatorId}|${day.date}`;
    if (days.has(key)) throw new Error('Jornada de operario repetida.');
    days.add(key);
  }
  const codes = new Set();
  const totals = new Map();
  for (const box of boxes) {
    requiredText(box?.code, 'Código de caja', 100);
    requiredText(box.operatorId, 'Operario', 50);
    if (!validDate(box.date) || !days.has(`${box.operatorId}|${box.date}`)) {
      throw new Error(`${box.code}: falta la jornada del operario en esa fecha.`);
    }
    if (codes.has(box.code)) throw new Error(`${box.code}: código de caja repetido.`);
    codes.add(box.code);
    if (!totals.has(box.date)) totals.set(box.date, {
      inicial: Object.fromEntries(['OPTIMO', ...CLASSIFICATIONS].map(id => [id, 0])),
      cierre: Object.fromEntries(['OPTIMO', ...CLASSIFICATIONS].map(id => [id, 0])),
    });
    for (const moment of MOMENTS) {
      const counts = compositionCounts(box[moment], box.code, moment);
      for (const [id, count] of Object.entries(counts)) totals.get(box.date)[moment][id] += count;
    }
  }
  for (const [date, moments] of totals) {
    for (const id of ['OPTIMO', ...CLASSIFICATIONS]) {
      if (moments.inicial[id] !== moments.cierre[id]) {
        throw new Error(`${date}: el total de ${id} cambió entre inspección y cierre.`);
      }
    }
  }
}

export function summarizeBoxControl(workDays, boxes) {
  const operators = new Map(workDays.map(day => [
    `${day.operatorId}|${day.date}`,
    { operatorId: day.operatorId, date: day.date, hoursWorked: day.hours, boxesReviewed: 0 },
  ]));
  const summary = { boxes: boxes.length, initialApproved: 0, initialBlocked: 0,
    finalApproved: 0, finalBlocked: 0 };
  for (const box of boxes) {
    operators.get(`${box.operatorId}|${box.date}`).boxesReviewed += 1;
    for (const [moment, prefix] of [['inicial', 'initial'], ['cierre', 'final']]) {
      const approved = box[moment].optimal === 20;
      summary[`${prefix}${approved ? 'Approved' : 'Blocked'}`] += 1;
    }
  }
  const byOperator = new Map();
  for (const day of operators.values()) {
    if (!byOperator.has(day.operatorId)) byOperator.set(day.operatorId, {
      operatorId: day.operatorId, hoursWorked: 0, boxesReviewed: 0,
    });
    const total = byOperator.get(day.operatorId);
    total.hoursWorked += day.hoursWorked;
    total.boxesReviewed += day.boxesReviewed;
  }
  return {
    summary,
    operators: [...byOperator.values()].map(row => ({
      ...row, boxesPerHour: row.boxesReviewed / row.hoursWorked,
    })).sort((a, b) => a.operatorId.localeCompare(b.operatorId)),
  };
}
