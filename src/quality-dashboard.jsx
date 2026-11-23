import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, ClipboardCheck, CircleCheck, FileSpreadsheet, LockKeyhole, TrendingUp } from 'lucide-react';

const fmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const percentFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const fullDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-PE');
const pages = {
  overview: ['Resumen general', 'El resultado de cada jornada, en una sola mirada.'],
  records: ['Control diario', 'Consolidados por mesa y fecha.'],
  defects: ['Detalle de fallas', 'Sets bloqueados por tipo de pieza y causa.'],
};

function Panel({ title, detail, children }) {
  return (
    <section className="quality-panel">
      <div className="quality-section-title">
        <div>
          <h2>{title}</h2>
          {detail && <span>{detail}</span>}
        </div>
      </div>
      {children}
    </section>
  );
}

function KpiCard({ icon: Icon, label, value, detail, color = 'blue' }) {
  return (
    <div className="quality-kpi">
      <div className="quality-kpi-top">
        <div className={`quality-icon ${color}`}>
          <Icon size={21} />
        </div>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="quality-empty" role="status">
      <div className="quality-empty-icon">
        <FileSpreadsheet size={29} />
      </div>
      <h2>Sin datos para esta selección</h2>
      <p>{text}</p>
    </div>
  );
}

function Target({ met }) {
  return (
    <span className={`quality-count ${met ? 'approved' : 'blocked'}`}>
      {met ? 'Cumplió' : 'No cumplió'}
    </span>
  );
}

function RecordsTable({ records }) {
  return (
    <div className="table-scroll" role="region" aria-label="Consolidados diarios por mesa" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>FECHA</th>
            <th>MESA</th>
            <th>PERSONAL</th>
            <th>HORAS</th>
            <th>INSPECCIONADAS</th>
            <th>CAJAS REQUERIDAS</th>
            <th>APROBADAS</th>
            <th>BLOQUEADAS</th>
            <th>SETS TOTALES</th>
            <th>CAJAS / H</th>
            <th>META</th>
          </tr>
        </thead>
        <tbody>
          {records.map(row => (
            <tr key={`${row.date}|${row.table}`}>
              <td>{fullDate(row.date)}</td>
              <td className="strong-cell">{row.table}</td>
              <td>{fmt.format(row.staff)}</td>
              <td>{fmt.format(row.hours)}</td>
              <td className="strong-cell">{fmt.format(row.inspected)}</td>
              <td>{fmt.format(row.required)}</td>
              <td>{fmt.format(row.approved)}</td>
              <td>{fmt.format(row.blocked)}</td>
              <td>{fmt.format(row.sets)}</td>
              <td>{fmt.format(row.productivity)}</td>
              <td><Target met={row.targetMet} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyChart({ daily }) {
  return (
    <div className="quality-chart" role="img" aria-label="Cajas aprobadas y bloqueadas por día; valores disponibles en Control diario">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daily} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fullDate} />
          <YAxis allowDecimals={false} />
          <Tooltip formatter={value => `${fmt.format(value)} cajas`} labelFormatter={fullDate} />
          <Bar dataKey="approved" name="Aprobadas" stackId="boxes" fill="#29936e" />
          <Bar dataKey="blocked" name="Bloqueadas" stackId="boxes" fill="#df9653" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TargetHero({ inspected, required, percentage, met, total, from, to }) {
  const periodLabel = from === to
    ? `Cumplimiento del ${fullDate(from)}`
    : 'Cumplimiento en el periodo';
  return (
    <section className="target-hero" aria-label="Cumplimiento de cajas requeridas">
      <div className="target-hero-goal">
        <span className="target-hero-eyebrow">META DE CAJAS · PERIODO SELECCIONADO</span>
        <div className="target-hero-number">
          <strong>{percentFmt.format(percentage)}%</strong>
          <span>de la meta alcanzada</span>
        </div>
        <p>Se requieren 50 cajas por operario en cada mesa y jornada</p>
      </div>
      <div className="target-hero-result">
        <span>{periodLabel}</span>
        <strong>{fmt.format(inspected)} / {fmt.format(required)}</strong>
        <p>cajas inspeccionadas / cajas requeridas</p>
        <div className={`target-hero-track ${percentage >= 100 ? 'is-met' : ''}`} aria-hidden="true">
          <span style={{ width: `${Math.min(percentage, 100)}%` }} />
        </div>
        <small>{met} de {total} jornadas cumplieron su meta</small>
      </div>
    </section>
  );
}

function Overview({ summary, daily, records, warnings, from, to }) {
  return (
    <>
      {warnings.length > 0 && <Warning dates={warnings} />}
      <TargetHero inspected={summary.inspected} required={summary.required}
        percentage={summary.attainmentRate} met={summary.targetMet} total={summary.workDays}
        from={from} to={to} />
      <div className="quality-kpi-grid">
        <KpiCard icon={ClipboardCheck} label="Cajas inspeccionadas"
          value={fmt.format(summary.inspected)} detail="Aprobadas + bloqueadas" />
        <KpiCard icon={CircleCheck} label="Cajas aprobadas"
          value={fmt.format(summary.approved)}
          detail={`${fmt.format(summary.approvalRate)}% de las inspeccionadas`} color="green" />
        <KpiCard icon={LockKeyhole} label="Cajas bloqueadas"
          value={fmt.format(summary.blocked)}
          detail={`${fmt.format(summary.blockedRate)}% de las inspeccionadas`} color="orange" />
        <KpiCard icon={TrendingUp} label="Sets totales"
          value={fmt.format(summary.sets)} detail="Cajas inspeccionadas × 2" color="teal" />
      </div>
      <Panel title="Inspección diaria" detail="Cajas aprobadas y bloqueadas por fecha">
        <DailyChart daily={daily} />
      </Panel>
      <Panel title="Últimas jornadas"
        detail={`Se muestran ${Math.min(records.length, 5)} de ${records.length}; consulta todas en Control diario.`}>
        <RecordsTable records={records.slice(0, 5)} />
      </Panel>
    </>
  );
}

function Warning({ dates }) {
  return (
    <div className="quality-formula" role="alert">
      <LockKeyhole size={22} />
      <div>
        <strong>Diferencia en sets bloqueados</strong>
        <p>El detalle no suma las cajas bloqueadas × 2 en: {dates.map(fullDate).join(', ')}. Revisa el Excel de esas fechas.</p>
      </div>
    </div>
  );
}

function Defects({ defects, table }) {
  return (
    <>
      {table && (
        <div className="quality-formula" role="note">
          <FileSpreadsheet size={22} />
          <div>
            <strong>Detalle de todas las mesas</strong>
            <p>El Excel no identifica la mesa de cada set bloqueado. Aquí solo se aplica el filtro de fechas.</p>
          </div>
        </div>
      )}
      {defects.warnings.length > 0 && <Warning dates={defects.warnings} />}
      {!defects.records.length ? (
        <Empty text="No se cargó detalle de fallas para estas fechas." />
      ) : (
        <>
          <div className="quality-secondary">
            <div><strong>{fmt.format(defects.origin)}</strong><span>Sets con falla de origen</span></div>
            <div><strong>{fmt.format(defects.nonOrigin)}</strong><span>Sets con falla no origen</span></div>
            <div><strong>{fmt.format(defects.total)}</strong><span>Sets bloqueados detallados</span></div>
          </div>
          <Panel title="Causas de bloqueo" detail="Cada set se registra en una sola categoría">
            <div className="classification-grid">
              {defects.categories.map(item => (
                <article className="classification-card" key={item.key}>
                  <div><h2>{item.label}</h2></div>
                  <strong>{fmt.format(item.sets)} <small>sets</small></strong>
                  <span className="classification-status">{item.group}</span>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Detalle por fecha y pieza" detail="Origen: proveedor · No origen: transporte o manipulación">
            <div className="table-scroll" role="region" aria-label="Sets bloqueados por fecha y pieza" tabIndex={0}>
              <table>
                <thead>
                  <tr><th>FECHA</th><th>PIEZA</th><th>ORIGEN</th><th>NO ORIGEN</th><th>TOTAL SETS</th></tr>
                </thead>
                <tbody>
                  {defects.records.map(row => (
                    <tr key={`${row.date}|${row.piece}`}>
                      <td>{fullDate(row.date)}</td>
                      <td className="strong-cell">{row.piece}</td>
                      <td>{fmt.format(row.origin)}</td>
                      <td>{fmt.format(row.nonOrigin)}</td>
                      <td className="strong-cell">{fmt.format(row.origin + row.nonOrigin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

export function QualityContent({ page, dashboard, loading, from, to, setFrom, setTo, onSelectDay, table, setTable }) {
  const [title, subtitle] = pages[page];
  const { summary, daily = [], records = [], defects, options = { tables: [] } } = dashboard || {};
  let content;
  if (loading) {
    content = <div className="quality-empty" role="status">Cargando jornadas…</div>;
  } else if (!dashboard) {
    content = <Empty text="No se pudieron cargar los datos. Revisa el aviso y el rango de fechas." />;
  } else if (page === 'defects') {
    content = <div className="quality-body"><Defects defects={defects} table={table} /></div>;
  } else if (!records.length) {
    content = <Empty text="Ajusta las fechas o la mesa para consultar otros registros." />;
  } else {
    content = (
      <div className="quality-body">
        {page === 'overview' && (
          <Overview summary={summary} daily={daily} records={records} warnings={defects.warnings}
            from={from} to={to} />
        )}
        {page === 'records' && (
          <Panel title="Consolidados diarios" detail="Inspeccionadas = aprobadas + bloqueadas">
            <RecordsTable records={records} />
          </Panel>
        )}
      </div>
    );
  }
  return (
    <>
      <div className="quality-header">
        <div>
          <div className="eyebrow">SERVICIO DE CONTROL DE CALIDAD</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <span className="quality-version">BELLIA <span>2 sets / caja</span></span>
      </div>
      <div className="quality-filters">
        <label>
          <CalendarDays size={16} />
          <span>Desde</span>
          <input aria-label="Fecha inicial" type="date" value={from}
            onChange={event => setFrom(event.target.value)} />
        </label>
        <label>
          <span>Hasta</span>
          <input aria-label="Fecha final" type="date" value={to}
            onChange={event => setTo(event.target.value)} />
        </label>
        <label>
          <span>Solo día</span>
          <input aria-label="Ver un solo día" type="date" value={from === to ? from : ''}
            onChange={event => onSelectDay(event.target.value)} />
        </label>
        <label>
          <span>Mesa</span>
          <select aria-label="Mesa" value={table} onChange={event => setTable(event.target.value)}>
            <option value="">Todas las mesas</option>
            {table && !options.tables.includes(table) && <option value={table}>{table}</option>}
            {options.tables.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      {content}
    </>
  );
}
