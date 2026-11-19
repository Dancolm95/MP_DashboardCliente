import React from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ClipboardCheck, CircleCheck, Clock3, AlertTriangle, CalendarDays, FileSpreadsheet, ArrowRight, UsersRound, LockKeyhole, TrendingUp } from 'lucide-react';

const fmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
const fullDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-PE');
const classificationColors = ['#3479b5', '#b87817', '#dc783f', '#c24657'];
const pages = {
  overview: ['Resumen general', 'El resultado de cada jornada, en una sola mirada.'],
  productivity: ['Productividad por operario', 'Cajas inspeccionadas por cada hora trabajada.'],
  records: ['Control diario', 'Un consolidado por operario y jornada de trabajo.'],
  classifications: ['Clasificaciones', 'Unidades observadas y su distribución por clasificación.'],
};

function Empty({ onNavigate, isAdmin }) {
  return <div className="quality-empty">
    <div className="quality-empty-icon"><FileSpreadsheet size={29} /></div>
    <h2>No hay jornadas para esta selección</h2>
    <p>Ajusta las fechas o el operario para consultar otros registros.</p>
    {isAdmin && <button className="outline empty-action" onClick={() => onNavigate('upload')}>Cargar Excel <ArrowRight size={16} /></button>}
  </div>;
}
function KpiCard({ icon: Icon, label, value, detail, color = 'blue' }) {
  return <div className="quality-kpi">
    <div className="quality-kpi-top"><div className={`quality-icon ${color}`}><Icon size={21} /></div><span>{label}</span></div>
    <strong>{value}</strong><small>{detail}</small>
  </div>;
}
function Panel({ title, detail, action, children, className = '' }) {
  return <section className={`quality-panel ${className}`}>
    <div className="quality-section-title"><div><h2>{title}</h2>{detail && <span>{detail}</span>}</div>{action}</div>
    {children}
  </section>;
}
function DailyTable({ records, classifications = false }) {
  return <div className="table-scroll" role="region" aria-label={classifications ? 'Unidades por jornada' : 'Consolidados diarios'} tabIndex={0}>
    <table><thead><tr>
      <th>FECHA</th><th>OPERARIO</th>
      {classifications ? <><th>TOLERADO</th><th>MENOR</th><th>MAYOR</th><th>CRÍTICO</th><th>OBSERVADAS</th></>
        : <><th>HORAS</th><th>INSPECCIONADAS</th><th>APROBADAS</th><th>BLOQUEADAS</th><th>CAJAS / H</th></>}
    </tr></thead><tbody>{records.map(row => <tr key={JSON.stringify([row.date, row.operatorId])}>
      <td>{fullDate(row.date)}</td><td className="strong-cell">{row.operatorId}</td>
      {classifications ? <>
        <td>{fmt.format(row.tolerated)}</td><td>{fmt.format(row.minor)}</td><td>{fmt.format(row.major)}</td><td>{fmt.format(row.critical)}</td><td className="strong-cell">{fmt.format(row.observed)}</td>
      </> : <>
        <td>{fmt.format(row.hours)}</td><td className="strong-cell">{fmt.format(row.inspected)}</td><td><span className="quality-count approved">{fmt.format(row.approved)}</span></td><td><span className={`quality-count ${row.blocked ? 'blocked' : ''}`}>{fmt.format(row.blocked)}</span></td><td>{fmt.format(row.productivity)}</td>
      </>}
    </tr>)}</tbody></table>
  </div>;
}
function Productivity({ operators, compact = false }) {
  const max = Math.max(1, ...operators.map(row => row.productivity));
  return <div className="operator-list">{(compact ? operators.slice(0, 5) : operators).map(row => <div className="operator-item" key={row.operatorId}>
    <div className="operator-heading"><div><span className="operator-avatar">{row.operatorId.slice(0, 1)}</span><strong>{row.operatorId}</strong></div><span><b>{fmt.format(row.productivity)}</b> cajas/h</span></div>
    <div className="breakdown-track"><i style={{ width: `${row.productivity / max * 100}%` }} /></div>
    <div className="operator-meta"><span>{fmt.format(row.inspected)} cajas inspeccionadas</span><span>{fmt.format(row.hours)} h · {row.workDays} {row.workDays === 1 ? 'jornada' : 'jornadas'}</span></div>
  </div>)}</div>;
}
function Classifications({ rows }) {
  return <div className="classification-grid">{rows.map((row, i) => <article className="classification-card" key={row.key} style={{ '--classification-color': classificationColors[i] }}>
    <div><span className="classification-dot" /><h2>{row.label}</h2><LockKeyhole size={15} /></div>
    <strong>{fmt.format(row.units)} <small>unidades</small></strong>
    <div className="classification-track"><i style={{ width: `${row.percentage}%` }} /></div>
    <p>{fmt.format(row.percentage)}% de las unidades observadas</p>
    <span className="classification-status">Implica bloqueo</span>
  </article>)}</div>;
}
function DailyChart({ daily }) {
  return <div className="quality-chart" role="img" aria-label="Cajas aprobadas y bloqueadas por día; valores disponibles en Control diario">
    <ResponsiveContainer width="100%" height="100%"><BarChart data={daily} margin={{ top: 18, right: 8, bottom: 0, left: -20 }}>
      <CartesianGrid vertical={false} stroke="#e9eef5" strokeDasharray="4 4" />
      <XAxis dataKey="date" tickFormatter={dateLabel} tickLine={false} axisLine={false} tick={{ fill: '#8090a6', fontSize: 11 }} />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8090a6', fontSize: 11 }} />
      <Tooltip labelFormatter={fullDate} formatter={v => `${fmt.format(v)} cajas`} cursor={{ fill: '#f2f5fa' }} />
      <Bar dataKey="approved" name="Aprobadas" stackId="boxes" fill="#29936e" maxBarSize={42} />
      <Bar dataKey="blocked" name="Bloqueadas" stackId="boxes" fill="#df9653" radius={[5, 5, 0, 0]} maxBarSize={42} />
    </BarChart></ResponsiveContainer>
  </div>;
}

export function QualityContent({ page, dashboard, loading, from, to, setFrom, setTo, operator, setOperator, onNavigate, isAdmin = false }) {
  const { summary, daily = [], operators = [], records = [], classifications = [], options = { operators: [] } } = dashboard || {};
  const [title, subtitle] = pages[page];
  return <>
    <div className="quality-header"><div><div className="eyebrow">SERVICIO DE CONTROL DE CALIDAD</div><h1>{title}</h1><p>{subtitle}</p></div><span className="quality-version">CALIDAD V2 <span>20 unidades / caja</span></span></div>
    <div className="quality-filters">
      <label><CalendarDays size={16} /><span>Desde</span><input aria-label="Fecha inicial" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label><span>Hasta</span><input aria-label="Fecha final" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <label><UsersRound size={16} /><span>Operario</span><select aria-label="Operario" value={operator} onChange={e => setOperator(e.target.value)}>
        <option value="">Todos los operarios</option>
        {operator && !options.operators.includes(operator) && <option value={operator}>{operator}</option>}
        {options.operators.map(value => <option key={value}>{value}</option>)}
      </select></label>
    </div>
    {loading ? <div className="quality-empty" role="status"><div className="spinner" />Cargando jornadas…</div>
      : !dashboard ? <div className="quality-empty" role="status">No se pudieron cargar los datos. Revisa el aviso y el rango de fechas.</div>
      : !records.length ? <Empty onNavigate={onNavigate} isAdmin={isAdmin} />
      : <div className="quality-body">
        {page === 'overview' && <>
          <div className="quality-kpi-grid">
            <KpiCard icon={ClipboardCheck} label="Cajas inspeccionadas" value={fmt.format(summary.inspected)} detail={`${fmt.format(summary.inspectedUnits)} unidades revisadas`} />
            <KpiCard icon={CircleCheck} label="Cajas aprobadas" value={fmt.format(summary.approved)} detail={`${fmt.format(summary.approvalRate)}% de las inspeccionadas`} color="green" />
            <KpiCard icon={LockKeyhole} label="Cajas bloqueadas" value={fmt.format(summary.blocked)} detail={`${fmt.format(summary.blockedRate)}% de las inspeccionadas`} color="orange" />
            <KpiCard icon={TrendingUp} label="Productividad" value={fmt.format(summary.productivity)} detail="Cajas por hora-persona" color="teal" />
          </div>
          <div className="quality-secondary">
            <div><strong>{summary.operatorCount}</strong><span>Operarios en el periodo</span></div>
            <div><strong>{summary.daysWithRecords}</strong><span>Días con registros</span></div>
            <div><strong>{fmt.format(summary.hours)} h</strong><span>Horas-persona acumuladas</span></div>
            <div><strong>{fmt.format(summary.observed)}</strong><span>Unidades observadas</span></div>
          </div>
          <div className="quality-main-grid">
            <Panel title="Inspección diaria" detail="Cajas aprobadas y bloqueadas en cada jornada">
              <DailyChart daily={daily} /><div className="chart-legend"><span><i className="green-dot" /> Aprobadas</span><span><i className="orange-dot" /> Bloqueadas</span></div>
            </Panel>
            <Panel title="Resultado de inspección" detail="Sobre el total de cajas inspeccionadas">
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={summary.inspected ? [{ name: 'Aprobadas', value: summary.approved }, { name: 'Bloqueadas', value: summary.blocked }] : [{ name: 'Sin inspección', value: 1 }]} dataKey="value" innerRadius="68%" outerRadius="86%" stroke="none"><Cell fill={summary.inspected ? '#29936e' : '#e5eaf1'} /><Cell fill="#df9653" /></Pie></PieChart></ResponsiveContainer>
                <div className="donut-center"><strong>{fmt.format(summary.approvalRate)}%</strong><span>aprobación</span></div>
              </div>
              <div className="donut-legend"><div><i className="green-dot" /> Aprobadas<strong>{fmt.format(summary.approved)}</strong></div><div><i className="orange-dot" /> Bloqueadas<strong>{fmt.format(summary.blocked)}</strong></div></div>
              <p className="donut-formula">Aprobadas ÷ inspeccionadas × 100</p>
            </Panel>
          </div>
          <Panel title="Productividad por operario" detail="Total de cajas ÷ total de horas del periodo" action={<button className="text-link" onClick={() => onNavigate('productivity')}>Ver detalle <ArrowRight size={16} /></button>}><Productivity operators={operators} compact /></Panel>
          <Panel title="Últimas jornadas" detail="Consolidados más recientes del periodo" action={<button className="text-link" onClick={() => onNavigate('records')}>Ver todas <ArrowRight size={16} /></button>}><DailyTable records={records.slice(0, 5)} /></Panel>
        </>}
        {page === 'productivity' && <>
          <div className="quality-formula"><Clock3 size={22} /><div><strong>Una medida común para cada operario</strong><p>Productividad = cajas inspeccionadas ÷ horas trabajadas. El periodo usa la suma de cajas y de horas.</p></div></div>
          <Panel title="Productividad del periodo" detail={`${operators.length} operarios · cajas por hora trabajada`}><Productivity operators={operators} /></Panel>
          <Panel title="Detalle por operario" detail="Totales para las fechas seleccionadas"><div className="table-scroll" tabIndex={0}><table><thead><tr><th>OPERARIO</th><th>JORNADAS</th><th>HORAS</th><th>INSPECCIONADAS</th><th>APROBADAS</th><th>BLOQUEADAS</th><th>CAJAS / H</th></tr></thead><tbody>{operators.map(row => <tr key={row.operatorId}><td className="strong-cell">{row.operatorId}</td><td>{row.workDays}</td><td>{fmt.format(row.hours)}</td><td>{fmt.format(row.inspected)}</td><td>{fmt.format(row.approved)}</td><td>{fmt.format(row.blocked)}</td><td className="strong-cell">{fmt.format(row.productivity)}</td></tr>)}</tbody></table></div></Panel>
        </>}
        {page === 'records' && <Panel title="Consolidados diarios" detail={`${records.length} ${records.length === 1 ? 'jornada' : 'jornadas'} · inspeccionadas = aprobadas + bloqueadas`}><DailyTable records={records} /></Panel>}
        {page === 'classifications' && <>
          <div className="quality-formula"><LockKeyhole size={22} /><div><strong>Las cuatro clasificaciones implican bloqueo</strong><p>Se cuentan unidades observadas, no cajas. Cada unidad se registra en una sola clasificación, incluido Tolerado.</p></div></div>
          <Classifications rows={classifications} />
          <Panel title="Unidades observadas por jornada" detail={`${fmt.format(summary.observed)} unidades en ${fmt.format(summary.blocked)} cajas bloqueadas`}><DailyTable records={records} classifications /></Panel>
        </>}
      </div>}
    <div className="quality-note"><AlertTriangle size={16} /><span>Cada caja contiene 20 unidades. Una caja con unidades Tolerado, Menor, Mayor o Crítico queda bloqueada.</span></div>
  </>;
}
