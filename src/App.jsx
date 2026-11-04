/* src/App.jsx — Interfaz del Sistema de Recordatorios */
import { useState, useEffect, useCallback } from 'react';
import { crearRecordatorio, listarRecordatorios, actualizarRecordatorio } from './api';

/* ── Constantes ───────────────────────────────────────────────── */
const ANTICIPACION_OPCIONES = [
  { label: '15 minutos antes', value: 15 },
  { label: '30 minutos antes', value: 30 },
  { label: '1 hora antes',     value: 60 },
  { label: '2 horas antes',    value: 120 },
  { label: '1 día antes',      value: 1440 },
];

const RECURRENCIA_OPCIONES = [
  { label: 'Sin repetición', value: 'ninguna' },
  { label: 'Diario',         value: 'diario'  },
  { label: 'Semanal',        value: 'semanal' },
  { label: 'Mensual',        value: 'mensual' },
];

const CANAL_OPCIONES = [
  { val: 'email',    label: 'Email',    icon: 'mail'   },
  { val: 'whatsapp', label: 'WhatsApp', icon: 'phone'  },
  { val: 'ambos',    label: 'Ambos',    icon: 'layers' },
];

const FILTROS = [
  { key: 'todos',     label: 'Todos'      },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'enviado',   label: 'Enviados'   },
  { key: 'cancelado', label: 'Cancelados' },
  { key: 'vencido',   label: 'Vencidos'   },
];

const EMAIL_DEFAULT = 'vikitomas1453@gmail.com';

const FORM_INICIAL = {
  titulo:             '',
  descripcion:        '',
  fecha_hora:         '',
  anticipacion:       60,
  recurrencia:        'ninguna',
  canal:              'email',
  destinatario_wa:    '',
  destinatario_email: EMAIL_DEFAULT,
};

/* ── Iconos (trazo 24x24) ─────────────────────────────────────── */
const TRAZOS = {
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5" />
      <path d="M13.7 20.5a2 2 0 0 1-3.4 0" />
    </>
  ),
  plus:     <path d="M12 5v14M5 12h14" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.2V12l3.2 1.9" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2.5 3.5 3.5L17 9.5" />
      <path d="M3 11.5V9a3 3 0 0 1 3-3h14.5" />
      <path d="m7 21.5-3.5-3.5L7 14.5" />
      <path d="M21 12.5V15a3 3 0 0 1-3 3H3.5" />
    </>
  ),
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.8" />
      <path d="M10.6 18.2h2.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2.8 9 4.7-9 4.7-9-4.7 9-4.7Z" />
      <path d="m3 12.6 9 4.7 9-4.7" />
      <path d="m3 17 9 4.7 9-4.7" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.9-6.4" />
      <path d="M20.5 3.5v5h-5" />
    </>
  ),
  close:    <path d="M18 6 6 18M6 6l12 12" />,
  check:    <path d="m20 6.5-10.5 11L4 12" />,
  alert: (
    <>
      <path d="M10.6 3.9 2.4 18a1.7 1.7 0 0 0 1.5 2.6h16.2A1.7 1.7 0 0 0 21.6 18L13.4 3.9a1.7 1.7 0 0 0-2.8 0Z" />
      <path d="M12 9v4.2M12 16.8h.01" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13.5h4l1.6 2.6h5.8l1.6-2.6h4" />
      <path d="M3.5 13.5 6.3 5.6A2 2 0 0 1 8.2 4.2h7.6a2 2 0 0 1 1.9 1.4l2.8 7.9v4.6a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
      <path d="m6.3 6.3 3 3M14.7 14.7l3 3M17.7 6.3l-3 3M9.3 14.7l-3 3" />
    </>
  ),
};

function Icono({ name, size = 15 }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRAZOS[name]}
    </svg>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */
function fmtFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function tiempoRelativo(iso) {
  if (!iso) return '';
  const diff = new Date(iso) - new Date();
  const abs  = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const hrs  = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);
  const past = diff < 0;
  if (mins < 1)   return past ? 'ahora'          : 'en menos de 1m';
  if (mins < 60)  return past ? `hace ${mins}m`  : `en ${mins}m`;
  if (hrs  < 24)  return past ? `hace ${hrs}h`   : `en ${hrs}h`;
  return past ? `hace ${days}d` : `en ${days}d`;
}

function fmtAnticipacion(min) {
  if (min < 60)   return `${min} min antes`;
  if (min === 1440) return '1 día antes';
  return `${min / 60} h antes`;
}

function capitalizar(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function parsearLista(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

/* ── Badges ───────────────────────────────────────────────────── */
const ESTADO_CONFIG = {
  pendiente: { label: 'Pendiente' },
  enviado:   { label: 'Enviado'   },
  cancelado: { label: 'Cancelado' },
  vencido:   { label: 'Vencido'   },
};

const CANAL_LABEL = { email: 'Email', whatsapp: 'WhatsApp', ambos: 'Ambos' };
const CANAL_ICON  = { email: 'mail',  whatsapp: 'phone',    ambos: 'layers' };

function BadgeEstado({ estado }) {
  const cfg = ESTADO_CONFIG[estado] || ESTADO_CONFIG.pendiente;
  return (
    <span className={`badge badge--${ESTADO_CONFIG[estado] ? estado : 'pendiente'}`}>
      <span className="badge-dot" />
      {cfg.label}
    </span>
  );
}

function BadgeCanal({ canal }) {
  return (
    <span className="badge-canal">
      <Icono name={CANAL_ICON[canal] || 'mail'} size={12} />
      {CANAL_LABEL[canal] || canal}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function App() {
  const [recordatorios, setRecordatorios] = useState([]);
  const [form,          setForm]          = useState(FORM_INICIAL);
  const [enviando,      setEnviando]      = useState(false);
  const [cargando,      setCargando]      = useState(true);
  const [msgExito,      setMsgExito]      = useState('');
  const [msgError,      setMsgError]      = useState('');
  const [msgLista,      setMsgLista]      = useState('');
  const [filtro,        setFiltro]        = useState('todos');

  /* ── Cargar lista ── */
  const cargarLista = useCallback(async () => {
    setCargando(true);
    try {
      const data = await listarRecordatorios();
      setRecordatorios(data);
      setMsgLista('');
    } catch (err) {
      console.error(err);
      setMsgLista(err.message || 'No se pudieron cargar los recordatorios.');
      setRecordatorios([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarLista(); }, [cargarLista]);

  /* ── Cambios del form ── */
  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const setCanal = (canal) => setForm(prev => ({ ...prev, canal }));

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsgExito(''); setMsgError('');

    if (!form.titulo.trim())       return setMsgError('El título es obligatorio.');
    if (!form.fecha_hora)          return setMsgError('La fecha y hora son obligatorias.');
    if (new Date(form.fecha_hora) <= new Date()) return setMsgError('La fecha debe ser futura.');

    if ((form.canal === 'whatsapp' || form.canal === 'ambos') && !form.destinatario_wa.trim())
      return setMsgError('Ingresa al menos un número de WhatsApp.');
    if ((form.canal === 'email' || form.canal === 'ambos') && !form.destinatario_email.trim())
      return setMsgError('Ingresa al menos un correo electrónico.');

    if (form.canal === 'email' || form.canal === 'ambos') {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const malos = parsearLista(form.destinatario_email).filter(c => !re.test(c));
      if (malos.length) return setMsgError(`Correo(s) inválido(s): ${malos.join(', ')}`);
    }

    setEnviando(true);
    try {
      await crearRecordatorio({
        ...form,
        fecha_hora:   new Date(form.fecha_hora).toISOString(),
        anticipacion: Number(form.anticipacion),
      });
      setMsgExito('Recordatorio programado. Te enviamos un correo de confirmación.');
      setForm(FORM_INICIAL);
      cargarLista();
    } catch (err) {
      setMsgError('Error al crear el recordatorio. Intenta de nuevo.');
      console.error(err);
    } finally {
      setEnviando(false);
    }
  };

  /* ── Cancelar ── */
  const handleCancelar = async (id) => {
    if (!window.confirm('¿Cancelar este recordatorio?')) return;
    try {
      await actualizarRecordatorio(id, { estado: 'cancelado' });
      cargarLista();
    } catch { alert('Error al cancelar. Intenta de nuevo.'); }
  };

  /* ── Filtrado ── */
  const lista = filtro === 'todos'
    ? recordatorios
    : recordatorios.filter(r => r.estado === filtro);

  const conteo = {
    todos:     recordatorios.length,
    pendiente: recordatorios.filter(r => r.estado === 'pendiente').length,
    enviado:   recordatorios.filter(r => r.estado === 'enviado').length,
    cancelado: recordatorios.filter(r => r.estado === 'cancelado').length,
    vencido:   recordatorios.filter(r => r.estado === 'vencido').length,
  };

  const nombreFiltro = (FILTROS.find(f => f.key === filtro) || FILTROS[0]).label.toLowerCase();

  /* ── Render ── */
  return (
    <div className="app">

      {/* ─── Header ─── */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon"><Icono name="bell" size={18} /></span>
          <div className="brand-text">
            <h1>Sistema de Recordatorios</h1>
            <p>Avisos por correo y WhatsApp</p>
          </div>
        </div>

        <div className="header-stats">
          <span className="stat">
            <span className="stat-dot" style={{ background: 'var(--amber)' }} />
            <strong>{conteo.pendiente}</strong>
            <span className="stat-label">pendientes</span>
          </span>
          <span className="stat">
            <span className="stat-dot" style={{ background: 'var(--mint)' }} />
            <strong>{conteo.enviado}</strong>
            <span className="stat-label">enviados</span>
          </span>
        </div>
      </header>

      <main className="app-main">

        {/* ════ FORMULARIO ════ */}
        <section className="card card--form">
          <div className="card-head">
            <span className="card-head-icon"><Icono name="plus" size={16} /></span>
            <div className="card-head-text">
              <h2>Nuevo recordatorio</h2>
              <p>Programa un aviso en menos de un minuto</p>
            </div>
          </div>

          {msgExito && (
            <div className="alert alert--ok" role="status" aria-live="polite">
              <Icono name="check" size={15} />
              <span>{msgExito}</span>
            </div>
          )}
          {msgError && (
            <div className="alert alert--err" role="alert" aria-live="assertive">
              <Icono name="alert" size={15} />
              <span>{msgError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>

            {/* Sección 1 — Evento */}
            <p className="section-title"><Icono name="sparkle" size={12} />Evento</p>

            <div className="field">
              <label className="field-label" htmlFor="titulo">
                Título <span className="req">*</span>
              </label>
              <input
                id="titulo"
                className="input"
                name="titulo"
                value={form.titulo}
                onChange={onChange}
                placeholder="Ej. Llamada con el doctor"
                autoComplete="off"
                data-gramm="false"
                data-enable-grammarly="false"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="descripcion">
                Descripción <span className="opt">opcional</span>
              </label>
              <textarea
                id="descripcion"
                className="input"
                name="descripcion"
                value={form.descripcion}
                onChange={onChange}
                placeholder="Notas adicionales…"
                rows={2}
                data-gramm="false"
                data-enable-grammarly="false"
              />
            </div>

            {/* Sección 2 — Horario */}
            <p className="section-title"><Icono name="calendar" size={12} />Horario</p>

            <div className="field">
              <label className="field-label" htmlFor="fecha_hora">
                Fecha y hora <span className="req">*</span>
              </label>
              <input
                id="fecha_hora"
                className="input"
                type="datetime-local"
                name="fecha_hora"
                value={form.fecha_hora}
                onChange={onChange}
              />
            </div>

            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor="anticipacion">Avisar con</label>
                <select
                  id="anticipacion"
                  className="input select"
                  name="anticipacion"
                  value={form.anticipacion}
                  onChange={onChange}
                >
                  {ANTICIPACION_OPCIONES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="recurrencia">Repetición</label>
                <select
                  id="recurrencia"
                  className="input select"
                  name="recurrencia"
                  value={form.recurrencia}
                  onChange={onChange}
                >
                  {RECURRENCIA_OPCIONES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sección 3 — Notificación */}
            <p className="section-title"><Icono name="bell" size={12} />Notificación</p>

            <div className="field">
              <span className="field-label" id="canal-label">Enviar por</span>
              <div className="segmented" role="group" aria-labelledby="canal-label">
                {CANAL_OPCIONES.map(({ val, label, icon }) => (
                  <button
                    key={val}
                    type="button"
                    className={form.canal === val ? 'active' : ''}
                    onClick={() => setCanal(val)}
                    aria-pressed={form.canal === val}
                  >
                    <Icono name={icon} size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {(form.canal === 'email' || form.canal === 'ambos') && (
              <div className="field">
                <label className="field-label" htmlFor="destinatario_email">
                  Correos <span className="req">*</span>
                  <span className="opt">separa varios con coma</span>
                </label>
                <input
                  id="destinatario_email"
                  className="input"
                  type="text"
                  name="destinatario_email"
                  value={form.destinatario_email}
                  onChange={onChange}
                  placeholder="tu@correo.com, otro@correo.com"
                />
                <p className="field-hint"><Icono name="mail" size={12} />Predeterminado: {EMAIL_DEFAULT}</p>
              </div>
            )}

            {(form.canal === 'whatsapp' || form.canal === 'ambos') && (
              <div className="field">
                <label className="field-label" htmlFor="destinatario_wa">
                  Números WhatsApp <span className="req">*</span>
                  <span className="opt">con código de país</span>
                </label>
                <input
                  id="destinatario_wa"
                  className="input"
                  name="destinatario_wa"
                  value={form.destinatario_wa}
                  onChange={onChange}
                  placeholder="5212229137794, 5218001234567"
                />
                <p className="field-hint"><Icono name="alert" size={12} />Cada número debe activar CallMeBot una vez.</p>
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={enviando}>
              {enviando
                ? <><span className="spinner" />Guardando…</>
                : <><Icono name="bell" size={15} />Crear recordatorio</>
              }
            </button>
          </form>
        </section>

        {/* ════ LISTA ════ */}
        <section className="card card--list">
          <div className="card-head">
            <span className="card-head-icon"><Icono name="inbox" size={16} /></span>
            <div className="card-head-text">
              <h2>Mis recordatorios</h2>
              <p>{conteo.todos} en total · {conteo.pendiente} por avisar</p>
            </div>
            <button
              className="btn-ghost"
              onClick={cargarLista}
              disabled={cargando}
              aria-label="Actualizar lista"
            >
              <Icono name="refresh" size={13} />
              {cargando ? 'Cargando' : 'Actualizar'}
            </button>
          </div>

          {msgLista && (
            <div className="alert alert--err" role="alert">
              <Icono name="alert" size={15} />
              <span>{msgLista}</span>
            </div>
          )}

          {/* Filtros */}
          <div className="filter-bar" role="tablist" aria-label="Filtrar por estado">
            {FILTROS.map(f => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filtro === f.key}
                className={`chip${filtro === f.key ? ' active' : ''}`}
                onClick={() => setFiltro(f.key)}
              >
                {f.label}
                <span className="chip-count">{conteo[f.key]}</span>
              </button>
            ))}
          </div>

          {/* Carga */}
          {cargando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" />)}
            </div>
          )}

          {/* Vacío */}
          {!cargando && lista.length === 0 && (
            <div className="empty">
              <span className="empty-icon"><Icono name="inbox" size={20} /></span>
              <p className="empty-title">
                {filtro === 'todos' ? 'Todavía no hay recordatorios' : `Sin recordatorios ${nombreFiltro}`}
              </p>
              <p className="empty-text">
                {filtro === 'todos' ? 'Crea el primero con el formulario.' : 'Prueba con otro filtro.'}
              </p>
            </div>
          )}

          {/* Lista */}
          <div className="rec-list">
            {lista.map((r, idx) => (
              <article
                key={r.id}
                className={`rec-item${r.estado === 'cancelado' ? ' rec-item--cancelado' : ''}`}
                style={{
                  animationDelay: `${Math.min(idx * 0.04, 0.3)}s`,
                  boxShadow: `inset 3px 0 0 var(--${r.estado === 'pendiente' ? 'amber'
                    : r.estado === 'enviado' ? 'mint'
                    : r.estado === 'cancelado' ? 'rose' : 'slate'})`,
                }}
              >
                <div className="rec-head">
                  <div className="rec-title-box">
                    <h3 className="rec-title">{r.titulo}</h3>
                    {r.descripcion && <p className="rec-desc">{r.descripcion}</p>}
                  </div>
                  <div className="rec-badges">
                    <BadgeCanal canal={r.canal} />
                    <BadgeEstado estado={r.estado} />
                  </div>
                </div>

                <div className="rec-meta">
                  <span className="meta"><Icono name="calendar" size={12} />{fmtFecha(r.fecha_hora)}</span>
                  <span className={`meta${r.estado === 'pendiente' ? ' meta--strong' : ''}`}>
                    <Icono name="clock" size={12} />{tiempoRelativo(r.fecha_hora)}
                  </span>
                  <span className="meta"><Icono name="bell" size={12} />{fmtAnticipacion(r.anticipacion)}</span>
                  {r.recurrencia !== 'ninguna' && (
                    <span className="meta"><Icono name="repeat" size={12} />{capitalizar(r.recurrencia)}</span>
                  )}
                </div>

                {(r.destinatario_email || r.destinatario_wa) && (
                  <div className="rec-dest">
                    {r.destinatario_email && (
                      <span><Icono name="mail" size={12} />{r.destinatario_email}</span>
                    )}
                    {r.destinatario_wa && (
                      <span><Icono name="phone" size={12} />{r.destinatario_wa}</span>
                    )}
                  </div>
                )}

                {r.estado === 'pendiente' && (
                  <button className="btn-cancel" onClick={() => handleCancelar(r.id)}>
                    <Icono name="close" size={12} />Cancelar
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
