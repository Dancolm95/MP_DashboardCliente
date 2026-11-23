import { boxesRequired, inspectedBoxes, DEFECT_FIELDS, ORIGIN_FIELDS, NON_ORIGIN_FIELD, SETS_PER_BOX } from './box-control.js';

const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const meetsTarget = row => row.staff > 0 && inspectedBoxes(row) >= boxesRequired(row.staff);

function totals(rows) {
  const approved = sum(rows, 'approved');
  const blocked = sum(rows, 'blocked');
  const inspected = approved + blocked;
  const required = rows.reduce((total, row) => total + boxesRequired(row.staff), 0);
  const hours = sum(rows, 'hours');
  return {
    approved, blocked, inspected, required, sets: inspected * SETS_PER_BOX, hours,
    attainmentRate: required ? inspected / required * 100 : 0,
    productivity: hours ? inspected / hours : 0,
    approvalRate: inspected ? approved / inspected * 100 : 0,
    blockedRate: inspected ? blocked / inspected * 100 : 0,
    workDays: rows.length,
    targetMet: rows.filter(meetsTarget).length,
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
export function buildDashboard(allRecords, allDetails = [], { table = '' } = {}) {
  const records = allRecords.filter(row => !table || row.table === table);
  const daily = grouped(records, 'date').sort((a, b) => a.date.localeCompare(b.date));
  const summary = {
    ...totals(records), daysWithRecords: daily.length,
    tableCount: new Set(records.map(row => row.table)).size,
  };
  const details = [...allDetails].sort((a, b) => b.date.localeCompare(a.date) || a.piece.localeCompare(b.piece))
    .map(row => ({
      ...row,
      origin: ORIGIN_FIELDS.reduce((total, field) => total + row[field.key], 0),
      nonOrigin: row[NON_ORIGIN_FIELD.key],
    }));
  const defectTotals = {
    origin: sum(details, 'origin'),
    nonOrigin: sum(details, 'nonOrigin'),
  };
  defectTotals.total = defectTotals.origin + defectTotals.nonOrigin;
  const detailDates = new Set(allRecords.map(row => row.date));
  const warnings = [...detailDates].filter(date => {
    const dayRows = allRecords.filter(row => row.date === date);
    if (!dayRows.every(row => row.detailProvided)) return false;
    const expected = sum(dayRows, 'blocked') * SETS_PER_BOX;
    const actual = details.filter(row => row.date === date)
      .reduce((total, row) => total + row.origin + row.nonOrigin, 0);
    return expected !== actual;
  }).sort();
  return {
    summary, daily,
    records: [...records].sort((a, b) => b.date.localeCompare(a.date) || a.table.localeCompare(b.table))
      .map(row => {
        const inspected = inspectedBoxes(row);
        return {
          ...row, inspected, required: boxesRequired(row.staff),
          sets: inspected * SETS_PER_BOX,
          productivity: inspected / row.hours,
          targetMet: meetsTarget(row),
        };
      }),
    defects: {
      ...defectTotals,
      categories: DEFECT_FIELDS.map(field => ({
        ...field,
        group: field === NON_ORIGIN_FIELD ? 'No origen' : 'Origen',
        sets: sum(details, field.key),
      })),
      records: details, warnings,
    },
    options: { tables: [...new Set(allRecords.map(row => row.table))].sort() },
  };
}
