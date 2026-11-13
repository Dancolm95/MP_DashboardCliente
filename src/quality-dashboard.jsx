import React, { useMemo } from 'react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { PackageCheck, ClipboardCheck, CircleCheck, Clock3, AlertTriangle, TrendingUp, CalendarDays, FileSpreadsheet, ArrowRight, Boxes, ListFilter } from 'lucide-react';

const fmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });
const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
const fullDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });

function Empty({ onNavigate, isAdmin }) {
  return <div className="quality-empty"><div className="quality-empty-icon"><FileSpreadsheet size={29}/></div><h2>Aún no hay registros para esta selección</h2><p>Cuando se cargue el Excel de control diario, aquí aparecerán los indicadores, tendencias e incidencias.</p>{isAdmin && <button className="outline empty-action" onClick={() => onNavigate('upload')}>Ir a la carga de Excel <ArrowRight size={16}/></button>}</div>;
}

function KpiCard({ icon: Icon, label, value, detail, color = 'blue' }) {
  return <div className="quality-kpi"><div className="quality-kpi-top"><div className={`quality-icon ${color}`}><Icon size={21}/></div><span>{label}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

function DataTable({ records }) {
  return <div className="table-scroll"><table><thead><tr><th>FECHA</th><th>TURNO</th><th>LOTE</th><th>PRODUCTO</th><th>RECIBIDAS</th><th>INSPECCIONADAS</th><th>APROBADAS</th><th>RECHAZADAS</th><th>MERMA*</th><th>PENDIENTES</th></tr></thead><tbody>{records.map(r => <tr key={r.id}><td className="strong-cell">{fullDate(r.date)}</td><td>{r.shift}</td><td>{r.lot}</td><td>{r.product}</td><td>{fmt.format(r.received)}</td><td>{fmt.format(r.inspected)}</td><td>{fmt.format(r.approved)}</td><td>{fmt.format(r.rejected)}</td><td>{fmt.format(r.waste)}</td><td>{fmt.format(r.pendingEnd)}</td></tr>)}</tbody></table></div>;
}

function IncidentTable({ incidents }) {
  return <div className="table-scroll"><table><thead><tr><th>FECHA</th><th>LOTE</th><th>PRODUCTO</th><th>DEFECTO</th><th>CAJAS AFECTADAS</th><th>DESTINO</th><th>RESPONSABLE</th></tr></thead><tbody>{incidents.map(i => <tr key={i.id}><td className="strong-cell">{fullDate(i.date)}</td><td>{i.lot}</td><td>{i.product}</td><td>{i.defect}</td><td>{fmt.format(i.affected)}</td><td>{i.action || '—'}</td><td>{i.responsible || '—'}</td></tr>)}</tbody></table></div>;
}

function Breakdown({ title, rows, pending = false }) {
  const max = Math.max(1, ...rows.map(r => r.inspected));
  return <div className="quality-panel"><div className="quality-section-title"><h2>{title}</h2><span>{pending ? 'Pendientes / disponibles' : 'Cajas inspeccionadas'}</span></div><div className="breakdown-list">{rows.map(row => {
    const available = row.received + row.pendingStart;
    const remaining = available - row.inspected;
    const width = pending ? (available ? remaining / available * 100 : 0) : row.inspected / max * 100;
    return <div className="breakdown-item" key={row.name}><div><strong>{row.name}</strong><span>{pending ? `${fmt.format(remaining)} de ${fmt.format(available)} cajas · ${fmt.format(width)}%` : `${fmt.format(row.inspected)} cajas`}</span></div><div className="breakdown-track"><i style={{ width: `${width}%` }}/></div></div>;
  })}</div></div>;
}

export function QualityContent({ page, dashboard, loading, from, to, setFrom, setTo, shift, setShift, product, setProduct, onNavigate, isAdmin = false }) {
  const { summary, daily = [], byShift = [], byProduct = [], records = [], incidents = [], options = { shifts: [], products: [] } } = dashboard || {};
  const cumulative = useMemo(() => { let received = 0, inspected = 0; return daily.map(day => ({ date: dateLabel(day.date), recibidas: received += day.received, inspeccionadas: inspected += day.inspected })); }, [daily]);
  const title = page === 'overview' ? 'Servicio de Control de Calidad' : page === 'records' ? 'Control diario' : 'Incidencias';
  const subtitle = page === 'overview' ? 'Recepción, inspección y control de mercadería' : page === 'records' ? 'Detalle por fecha, turno y lote' : 'Defectos y acciones registrados por lote';
  return <><div className="quality-header"><div><div className="eyebrow">{page === 'overview' ? 'PANORAMA OPERATIVO' : 'DETALLE OPERATIVO'}</div><h1>{title}</h1><p>{subtitle}</p></div></div>
    <div className="quality-filters"><label><CalendarDays size={16}/><span>Desde</span><input aria-label="Fecha inicial" type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label><span>Hasta</span><input aria-label="Fecha final" type="date" value={to} onChange={e => setTo(e.target.value)}/></label><label><ListFilter size={16}/><span>Turno</span><select aria-label="Turno" value={shift} onChange={e => setShift(e.target.value)}><option value="">Todos</option>{options.shifts.map(v => <option key={v}>{v}</option>)}</select></label><label><Boxes size={16}/><span>Producto</span><select aria-label="Producto" value={product} onChange={e => setProduct(e.target.value)}><option value="">Todos</option>{options.products.map(v => <option key={v}>{v}</option>)}</select></label></div>
    {!records.length ? <Empty onNavigate={onNavigate} isAdmin={isAdmin}/> : page === 'overview' ? <div className="quality-body">
      <div className="quality-kpi-grid"><KpiCard icon={PackageCheck} label="Cajas recibidas" value={fmt.format(summary.received)} detail="Total del periodo"/><KpiCard icon={ClipboardCheck} label="Cajas inspeccionadas" value={fmt.format(summary.inspected)} detail="Total del periodo" color="green"/><KpiCard icon={CircleCheck} label="Aprobación" value={`${fmt.format(summary.approvalRate)}%`} detail={`${fmt.format(summary.approved)} cajas aprobadas`} color="teal"/><KpiCard icon={Clock3} label="Pendientes al cierre" value={fmt.format(summary.pendingEnd)} detail={`Saldo general · ${fullDate(summary.pendingDate)}`} color="orange"/></div>
      <div className="quality-secondary"><div><strong>{fmt.format(summary.rejected)}</strong><span>Cajas rechazadas</span></div><div><strong>{fmt.format(summary.waste)}</strong><span>Cajas con merma <em>informativo</em></span></div><div><strong>{fmt.format(summary.productivity)}</strong><span>Cajas por hora-persona</span></div><div><strong>{fmt.format(summary.completionGeneral)}%</strong><span>Inspección general del periodo</span></div></div>
      <div className="quality-main-grid"><div className="quality-panel chart-panel"><div className="quality-section-title"><div><h2>Avance acumulado</h2><span>Cajas recibidas e inspeccionadas</span></div><span>{daily.length} días</span></div><div className="quality-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={cumulative} margin={{ top: 18, right: 15, bottom: 0, left: -14 }}><defs><linearGradient id="inspectedFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#23845e" stopOpacity=".25"/><stop offset="100%" stopColor="#23845e" stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9eef5" strokeDasharray="4 4"/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#8090a6', fontSize: 11 }}/><YAxis tickLine={false} axisLine={false} tick={{ fill: '#8090a6', fontSize: 11 }}/><Tooltip formatter={v => fmt.format(v)}/><Area type="monotone" dataKey="recibidas" name="Recibidas" stroke="#3869ac" strokeWidth={2} fill="transparent" dot={false}/><Area type="monotone" dataKey="inspeccionadas" name="Inspeccionadas" stroke="#16865a" strokeWidth={3} fill="url(#inspectedFill)" dot={false}/></AreaChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="blue-dot"/> Recibidas</span><span><i className="green-dot"/> Inspeccionadas</span></div></div>
      <div className="quality-panel"><div className="quality-section-title"><div><h2>Control de calidad</h2><span>Resultado de la inspección</span></div></div><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: 'Aprobadas', value: summary.approved }, { name: 'Rechazadas', value: summary.rejected }]} dataKey="value" innerRadius="66%" outerRadius="86%" stroke="none"><Cell fill="#17935e"/><Cell fill="#e5eaf1"/></Pie></PieChart></ResponsiveContainer><div className="donut-center"><strong>{fmt.format(summary.approvalRate)}%</strong><span>aprobación</span></div></div><div className="donut-legend"><div><i className="green-dot"/> Aprobadas <strong>{fmt.format(summary.approved)}</strong></div><div><i className="gray-dot"/> Rechazadas <strong>{fmt.format(summary.rejected)}</strong></div></div></div></div>
      <div className="quality-breakdowns"><Breakdown title="Pendientes por turno" rows={byShift} pending/><Breakdown title="Inspección por producto" rows={byProduct}/></div>
      <div className="quality-panel"><div className="quality-section-title"><div><h2>Registros recientes</h2><span>Detalle de las últimas operaciones</span></div><button className="text-link" onClick={() => onNavigate('records')}>Ver todos <ArrowRight size={16}/></button></div><DataTable records={records.slice(0, 5)}/></div>
    </div> : <div className="quality-panel detail-panel"><div className="quality-section-title"><div><h2>{page === 'records' ? 'Detalle de operaciones' : 'Detalle de incidencias'}</h2><span>{page === 'records' ? `${records.length} registros` : `${incidents.length} incidencias`}</span></div></div>{page === 'records' ? <DataTable records={records}/> : incidents.length ? <IncidentTable incidents={incidents}/> : <div className="no-incidents"><CircleCheck size={25}/><strong>No hay incidencias para esta selección</strong></div>}</div>}
    <div className="quality-note"><AlertTriangle size={16}/><span>La merma se muestra como cantidad informativa. El saldo pendiente corresponde al cierre general más reciente del rango y no se divide por turno o producto.</span></div>
  </>;
}
