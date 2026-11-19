import { CLASSIFICATIONS, UNITS_PER_BOX } from './box-control.js';

const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
function totals(rows) {
  const approved = sum(rows, 'approved');
  const blocked = sum(rows, 'blocked');
  const inspected = approved + blocked;
  const hours = sum(rows, 'hours');
  const observed = CLASSIFICATIONS.reduce((total, c) => total + sum(rows, c.key), 0);
  return {
    approved, blocked, inspected, hours, observed,
    inspectedUnits: inspected * UNITS_PER_BOX,
    productivity: hours ? inspected / hours : 0,
    approvalRate: inspected ? approved / inspected * 100 : 0,
    blockedRate: inspected ? blocked / inspected * 100 : 0,
    workDays: rows.length,
    operatorCount: new Set(rows.map(row => row.operatorId)).size,
  };
}
function grouped(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[field])) groups.set(row[field], []);
    groups.get(row[field]).push(row);
  }
  return [...groups].map(([value, items]) => ({ [field]: value, ...totals(items) }));
}
export function buildDashboard(allRecords, { operator = '' } = {}) {
  const records = allRecords.filter(row => !operator || row.operatorId === operator);
  const summary = totals(records);
  return {
    summary,
    daily: grouped(records, 'date').sort((a, b) => a.date.localeCompare(b.date)),
    operators: grouped(records, 'operatorId').sort((a, b) =>
      b.productivity - a.productivity || a.operatorId.localeCompare(b.operatorId)),
    classifications: CLASSIFICATIONS.map(c => {
      const units = sum(records, c.key);
      return { ...c, units, percentage: summary.observed ? units / summary.observed * 100 : 0 };
    }),
    records: [...records].sort((a, b) => b.date.localeCompare(a.date)
      || a.operatorId.localeCompare(b.operatorId)).map(row => ({
      ...row, inspected: row.approved + row.blocked,
      productivity: (row.approved + row.blocked) / row.hours,
      observed: CLASSIFICATIONS.reduce((total, c) => total + row[c.key], 0),
    })),
    options: { operators: [...new Set(allRecords.map(row => row.operatorId))].sort() },
  };
}
