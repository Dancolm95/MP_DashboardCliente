export function groupReports(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, { id: row.id, date: row.date, uploadedAt: row.uploadedAt, sourceName: row.sourceName, isDemo: Boolean(row.isDemo), metrics: [] });
    byId.get(row.id).metrics.push({ key: row.metricKey, label: row.metricLabel, value: Number(row.metricValue) });
  }
  return [...byId.values()];
}
