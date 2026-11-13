import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LayoutDashboard, Table2, UploadCloud, UsersRound, LogOut, Download, FileSpreadsheet, CircleCheck, AlertCircle, Menu, X, LockKeyhole, Mail, ArrowRight, Database, ShieldCheck } from 'lucide-react';
import './style.css';
import { QualityContent } from './quality-dashboard.jsx';

const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localDate(new Date());
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 29); return localDate(d); };
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(body?.error || 'No se pudo completar la operación.');
    error.status = response.status;
    throw error;
  }
  return body;
}

function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [page, setPage] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [shift, setShift] = useState('');
  const [product, setProduct] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sessionVersion = useRef(0);
  const clearAccess = () => {
    sessionVersion.current += 1;
    setUser(null);
    setDashboard(null);
    setPage('overview');
    setFrom(monthAgo());
    setTo(today());
    setShift('');
    setProduct('');
    setLoading(false);
    setNotice(null);
  };
  useEffect(() => { api('/auth/me').then(data => setUser(data.user)).catch(() => {}).finally(() => setBooting(false)); }, []);
  const reload = () => {
    const version = sessionVersion.current;
    setLoading(true);
    api(`/dashboard?from=${from}&to=${to}&shift=${encodeURIComponent(shift)}&product=${encodeURIComponent(product)}`)
      .then(data => { if (sessionVersion.current === version) setDashboard(data); })
      .catch(error => {
        if (sessionVersion.current !== version) return;
        if (error.status === 401) clearAccess();
        else setNotice({ type: 'error', text: error.message });
      })
      .finally(() => { if (sessionVersion.current === version) setLoading(false); });
  };
  useEffect(() => { if (user) reload(); }, [user, from, to, shift, product]);
  const setTab = next => { setPage(next); setNotice(null); setMobileOpen(false); };
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); clearAccess(); };
  if (booting) return <div className="boot"><div className="spinner"/>Cargando panel...</div>;
  if (!user) return <Login onLogin={setUser}/>;
  const nav = [{ id: 'overview', label: 'Resumen', icon: LayoutDashboard }, { id: 'records', label: 'Control diario', icon: Table2 }, { id: 'incidents', label: 'Incidencias', icon: AlertCircle }, ...(user.role === 'admin' ? [{ id: 'upload', label: 'Cargar Excel', icon: UploadCloud }, { id: 'users', label: 'Usuarios', icon: UsersRound }] : [])];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span>M</span></div><div><strong>MP Dashboard</strong><small>Panel de indicadores</small></div><button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={20}/></button></div>
      <div className="nav-label">ESPACIO DE TRABAJO</div>
      <nav>{nav.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`nav-item ${page === item.id ? 'active' : ''}`}><item.icon size={19} strokeWidth={1.9}/><span>{item.label}</span>{page === item.id && <span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><div className="help-icon"><Database size={18}/></div><strong>Datos organizados</strong><p>Consulta los indicadores diarios en un solo lugar.</p></div><button className="profile" onClick={logout}><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="profile-text"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrador' : 'Visualizador'}</small></span><LogOut size={17}/></button></div>
    </aside>
    {mobileOpen && <div className="overlay" onClick={() => setMobileOpen(false)}/>}
    <main className="main"><header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={22}/></button><strong>{nav.find(n => n.id === page)?.label}</strong></div><div className="topbar-right"><span className="online-dot"/> Datos actualizados <span className="top-avatar">{user.name.slice(0, 1).toUpperCase()}</span></div></header>
      <div className="content">
        {notice && <div className={`notice ${notice.type}`}><span>{notice.type === 'error' ? <AlertCircle size={18}/> : <CircleCheck size={18}/>}</span>{notice.text}<button onClick={() => setNotice(null)}><X size={16}/></button></div>}
        {['overview','records','incidents'].includes(page) && <QualityContent page={page} dashboard={dashboard} loading={loading} from={from} to={to} setFrom={setFrom} setTo={setTo} shift={shift} setShift={setShift} product={product} setProduct={setProduct} onNavigate={setTab} isAdmin={user.role === 'admin'}/>}
        {page === 'upload' && <UploadPage onSuccess={(message, warnings) => { reload(); setTab('overview'); setNotice({ type: warnings.length ? 'error' : 'success', text: warnings.length ? `${message} Advertencias: ${warnings.join(' ')}` : message }); }}/>
        {page === 'users' && <UsersPage setNotice={setNotice}/>}
      </div>
    </main>
  </div>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { const data = await api('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); onLogin(data.user); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <div className="login-layout"><div className="login-visual"><div className="login-logo"><div className="brand-mark"><span>M</span></div><strong>MP Dashboard</strong></div><div className="visual-content"><div className="visual-tag"><span/> INTELIGENCIA OPERATIVA</div><h2>Todo lo importante,<br/><em>en un solo lugar.</em></h2><p>Convierte los resultados de cada día en decisiones más claras para tu equipo.</p><div className="preview-card"><div className="preview-top"><span>Panorama de indicadores</span><span>↗</span></div><div className="preview-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="preview-line"><span>↗ 12.8%</span> tendencia positiva</div></div></div><div className="visual-foot">© {new Date().getFullYear()} MP Dashboard · Control en cada dato</div></div><div className="login-side"><div className="login-form-wrap"><div className="login-icon"><LockKeyhole size={22}/></div><div className="eyebrow">BIENVENIDO DE NUEVO</div><h1>Inicia sesión</h1><p>Ingresa tus credenciales para acceder al panel de indicadores.</p><form onSubmit={submit}><label>Correo electrónico<div className="field"><Mail size={18}/><input type="email" placeholder="tu@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required/></div></label><label>Contraseña<div className="field"><LockKeyhole size={18}/><input type="password" placeholder="••••••••••" value={password} onChange={e => setPassword(e.target.value)} required/></div></label>{error && <div className="form-error"><AlertCircle size={16}/>{error}</div>}<button className="primary login-submit" disabled={busy}>{busy ? 'Ingresando...' : <>Ingresar al panel <ArrowRight size={18}/></>}</button></form><div className="login-note"><ShieldCheck size={17}/> Acceso exclusivo para usuarios autorizados</div></div><div className="login-mobile-foot">© {new Date().getFullYear()} MP Dashboard</div></div></div>;
}

function UploadPage({ onSuccess }) {
  const [file, setFile] = useState(null); const [drag, setDrag] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit() { if (!file) return; setBusy(true); setError(''); try { const data = await api('/uploads', { method: 'POST', headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'X-File-Name': file.name }, body: file }); onSuccess(`${data.recordCount} registros y ${data.incidentCount} incidencias cargados.`, data.warnings || []); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  async function download() { const response = await fetch('/api/template'); if (!response.ok) { setError('No se pudo descargar la plantilla.'); return; } const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = 'plantilla-kpis.xlsx'; a.click(); URL.revokeObjectURL(url); }
  return <><div className="page-head"><div><div className="eyebrow">ADMINISTRACIÓN DE DATOS</div><h1>Cargar control de calidad</h1><p>Importa los registros nuevos al cierre de la jornada.</p></div></div><div className="upload-layout"><div className="upload-card"><div className="section-head"><div><h2>Subir archivo Excel</h2><p>Se leerán CONTROL_DIARIO, INCIDENCIAS y RESUMEN_KPI.</p></div><div className="upload-step">01</div></div><div className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0] || null); setError(''); }}><input id="excel-file" type="file" accept=".xlsx" onChange={e => { setFile(e.target.files[0] || null); setError(''); }}/><label htmlFor="excel-file"><div className="drop-icon"><UploadCloud size={27}/></div><strong>{file ? file.name : 'Arrastra tu Excel aquí'}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB · Haz clic para cambiar` : <>o <b>explora tus archivos</b> para seleccionar uno</>}</span><small>Formato .xlsx · Máximo 2 MB</small></label></div>{error && <div className="form-error"><AlertCircle size={17}/>{error}</div>}<button className="primary upload-submit" disabled={!file || busy} onClick={submit}>{busy ? 'Procesando archivo...' : <>Cargar registros <ArrowRight size={18}/></>}</button></div><div className="guide-card"><div className="guide-icon"><FileSpreadsheet size={23}/></div><h2>Prepara tu archivo</h2><p>Utiliza la estructura de las tres hojas para registrar cada fecha, turno y lote.</p><div className="guide-list"><div><span>1</span> CONTROL_DIARIO contiene las cajas y el saldo pendiente.</div><div><span>2</span> INCIDENCIAS detalla los defectos por lote.</div><div><span>3</span> RESUMEN_KPI permite contrastar los totales.</div><div><span>4</span> Sube solo registros nuevos; los duplicados se rechazan.</div></div><button className="outline" onClick={download}><Download size={17}/> Descargar estructura</button></div></div></>;
}

function UsersPage({ setNotice }) {
  const [users, setUsers] = useState([]); const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { api('/users').then(data => setUsers(data.users)).catch(err => setError(err.message)); }, []);
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { const data = await api('/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); setUsers(u => [data.user, ...u]); setForm({ name: '', email: '', password: '', role: 'viewer' }); setNotice({ type: 'success', text: `Cuenta de ${data.user.name} creada correctamente.` }); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <><div className="page-head"><div><div className="eyebrow">CONTROL DE ACCESO</div><h1>Usuarios</h1><p>Administra quién puede consultar o actualizar el panel.</p></div></div><div className="users-layout"><div className="users-card"><div className="section-head"><div><h2>Cuentas activas</h2><p>{users.length} usuarios con acceso</p></div><UsersRound size={20}/></div><div className="user-list">{users.map(u => <div className="user-row" key={u.id}><div className="user-avatar">{u.name.slice(0, 1).toUpperCase()}</div><div className="user-info"><strong>{u.name}</strong><span>{u.email}</span></div><span className={`role-badge ${u.role}`}>{u.role === 'admin' ? 'Admin' : 'Visualizador'}</span></div>)}</div></div><div className="create-card"><div className="section-head"><div><h2>Nuevo usuario</h2><p>Crea una cuenta para el equipo.</p></div><div className="upload-step">+</div></div><form onSubmit={submit}><label>Nombre completo<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellido" required minLength="2"/></label><label>Correo electrónico<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="usuario@empresa.com" required/></label><label>Contraseña inicial<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 10 caracteres" required minLength="10"/></label><label>Rol<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="viewer">Visualizador</option><option value="admin">Administrador</option></select></label>{error && <div className="form-error"><AlertCircle size={16}/>{error}</div>}<button className="primary" disabled={busy}>{busy ? 'Creando...' : <>Crear usuario <ArrowRight size={18}/></>}</button></form></div></div></>;
}

createRoot(document.getElementById('root')).render(<App/>);
