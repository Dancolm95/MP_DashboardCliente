const DAILY_FIELDS = ['pendingStart', 'received', 'inspected', 'approved', 'rejected', 'waste'];

const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const percent = (part, total) => total ? part / total * 100 : 0;

function group(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const name = row[field];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }

  return [...groups].map(([name, items]) => ({
    name,
    received: sum(items, 'received'),
    pendingStart: sum(items, 'pendingStart'),
    inspected: sum(items, 'inspected'),
    approved: sum(items, 'approved'),
    rejected: sum(items, 'rejected'),
    waste: sum(items, 'waste'),
  })).sort((a, b) => b.inspected - a.inspected);
}

function buildSummary(records, allRecords) {
  const received = sum(records, 'received');
  const inspected = sum(records, 'inspected');
  const approved = sum(records, 'approved');
  const rejected = sum(records, 'rejected');
  const waste = sum(records, 'waste');

  const openingDate = records.reduce((date, record) =>
    !date || record.date < date ? record.date : date, null);
  const openingPending = sum(records.filter(record => record.date === openingDate), 'pendingStart');
  const available = received + openingPending;
  const personHours = records.reduce((total, record) =>
    total + Number(record.staff) * Number(record.hoursPerPerson), 0);

  const chronologicalRecords = [...allRecords].sort((a, b) =>
    a.date.localeCompare(b.date)
    || String(a.uploadedAt || '').localeCompare(String(b.uploadedAt || ''))
    || Number(a.rowOrder) - Number(b.rowOrder));
  const first = chronologicalRecords[0];
  const last = chronologicalRecords.at(-1);
  const generalReceived = sum(allRecords, 'received');
  const generalInspected = sum(allRecords, 'inspected');

  return {
    received,
    openingPending,
    available,
    inspected,
    approved,
    rejected,
    pendingToInspect: available - inspected,
    waste,
    approvalRate: percent(approved, available),
    rejectionRate: percent(rejected, available),
    productivity: personHours ? inspected / personHours : 0,
    pendingEnd: last ? Number(last.pendingEnd) : null,
    pendingDate: last?.date || null,
    completionGeneral: first
      ? percent(generalInspected, generalReceived + Number(first.pendingStart))
      : null,
  };
}

function buildDaily(records) {
  const days = new Map();
  for (const record of records) {
    if (!days.has(record.date)) {
      days.set(record.date, {
        date: record.date,
        pendingStart: 0,
        received: 0,
        inspected: 0,
        approved: 0,
        rejected: 0,
        waste: 0,
      });
    }
    const day = days.get(record.date);
    for (const field of DAILY_FIELDS) day[field] += Number(record[field]);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildDashboard(allRecords, allIncidents, { shift = '', product = '' } = {}) {
  const records = allRecords.filter(record =>
    (!shift || record.shift === shift) && (!product || record.product === product));
  const selectedIds = new Set(records.map(record => record.id));
  const incidents = allIncidents.filter(incident => selectedIds.has(incident.recordId));

  return {
    summary: buildSummary(records, allRecords),
    daily: buildDaily(records),
    byShift: group(records, 'shift'),
    byProduct: group(records, 'product'),
    records: [...records].sort((a, b) =>
      b.date.localeCompare(a.date) || Number(b.rowOrder) - Number(a.rowOrder)),
    incidents: [...incidents].sort((a, b) => b.date.localeCompare(a.date)),
    options: {
      shifts: [...new Set(allRecords.map(record => record.shift))].sort(),
      products: [...new Set(allRecords.map(record => record.product))].sort(),
    },
  };
}
