const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const percent = (num, den) => den ? num / den * 100 : 0;
const group = (rows, field) => [...rows.reduce((map, row) => {
  const name = row[field];
  if (!map.has(name)) map.set(name, []);
  map.get(name).push(row);
  return map;
}, new Map())].map(([name, items]) => ({ name, received: sum(items, 'received'), pendingStart: sum(items, 'pendingStart'), inspected: sum(items, 'inspected'), approved: sum(items, 'approved'), rejected: sum(items, 'rejected'), waste: sum(items, 'waste') })).sort((a, b) => b.inspected - a.inspected);

export function buildDashboard(allRecords, allIncidents, { shift = '', product = '' } = {}) {
  const records = allRecords.filter(record => (!shift || record.shift === shift) && (!product || record.product === product));
  const selectedIds = new Set(records.map(record => record.id));
  const incidents = allIncidents.filter(incident => selectedIds.has(incident.recordId));
  const received = sum(records, 'received');
  const inspected = sum(records, 'inspected');
  const approved = sum(records, 'approved');
  const rejected = sum(records, 'rejected');
  const waste = sum(records, 'waste');
  const personHours = records.reduce((n, r) => n + Number(r.staff) * Number(r.hoursPerPerson), 0);
  const ordered = [...allRecords].sort((a, b) => a.date.localeCompare(b.date) || String(a.uploadedAt || '').localeCompare(String(b.uploadedAt || '')) || Number(a.rowOrder) - Number(b.rowOrder));
  const last = ordered.at(-1);
  const first = ordered[0];
  const generalInspected = sum(allRecords, 'inspected');
  const generalReceived = sum(allRecords, 'received');
  const dailyMap = new Map();
  for (const record of records) {
    if (!dailyMap.has(record.date)) dailyMap.set(record.date, { date: record.date, pendingStart: 0, received: 0, inspected: 0, approved: 0, rejected: 0, waste: 0 });
    const day = dailyMap.get(record.date);
    for (const field of ['pendingStart', 'received', 'inspected', 'approved', 'rejected', 'waste']) day[field] += Number(record[field]);
  }
  return {
    summary: { received, inspected, approved, rejected, waste, approvalRate: percent(approved, inspected), rejectionRate: percent(rejected, inspected), productivity: personHours ? inspected / personHours : 0, pendingEnd: last ? Number(last.pendingEnd) : null, pendingDate: last?.date || null, completionGeneral: first ? percent(generalInspected, generalReceived + Number(first.pendingStart)) : null },
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byShift: group(records, 'shift'), byProduct: group(records, 'product'),
    records: [...records].sort((a, b) => b.date.localeCompare(a.date) || Number(b.rowOrder) - Number(a.rowOrder)),
    incidents: [...incidents].sort((a, b) => b.date.localeCompare(a.date)),
    options: { shifts: [...new Set(allRecords.map(r => r.shift))].sort(), products: [...new Set(allRecords.map(r => r.product))].sort() },
  };
}
