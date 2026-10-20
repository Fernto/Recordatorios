/* src/App.jsx — Premium Dark UI */
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
  { label: 'Sin repetición', value: 'ninguna'  },
  { label: 'Diario',         value: 'diario'   },
  { label: 'Semanal',        value: 'semanal'  },
  { label: 'Mensual',        value: 'mensual'  },
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
  if (mins < 60)  return past ? `hace ${mins}m`       : `en ${mins}m`;
  if (hrs  < 24)  return past ? `hace ${hrs}h`         : `en ${hrs}h`;
  return past ? `hace ${days}d` : `en ${days}d`;
}

function parsearLista(str) {
  return (str || '').split(',').map(s => s.trim()).filter(Boolean);
}

/* ── Badges ───────────────────────────────────────────────────── */
const ESTADO_CONFIG = {
  pendiente: { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  label: 'Pendiente', dot: '#fbbf24' },
  enviado:   { color: '#34d399', bg: 'rgba(52,211,153,0.15)', label: 'Enviado',   dot: '#34d399' },
  cancelado: { color: '#f87171', bg: 'rgba(248,113,113,0.15)',label: 'Cancelado', dot: '#f87171' },
};

function BadgeEstado({ estado }) {
  const c = ESTADO_CONFIG[estado] || ESTADO_CONFIG.pendiente;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: c.bg, color: c.color,
      padding: '3px 10px', borderRadius: 99,
      fontSize: 12, fontWeight: 600,
      border: `1px solid ${c.color}44`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: c.dot, flexShrink: 0,
      }} />
      {c.label}
    </span>
  );
}

function BadgeCanal({ canal }) {
  const map = { ambos: '📱 + 📧', whatsapp: '📱 WA', email: '📧 Email' };
  return (
    <span style={{
      fontSize: 12, color: 'var(--text-muted)',
      background: 'rgba(255,255,255,0.06)',
      padding: '2px 8px', borderRadius: 99,
      border: '1px solid rgba(255,255,255,0.10)',
    }}>
      {map[canal] || canal}
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
  const [filtro,        setFiltro]        = useState('todos');

  /* ── Cargar lista ── */
  const cargarLista = useCallback(async () => {
    setCargando(true);
    const data = await listarRecordatorios();
    setRecordatorios(data);
    setCargando(false);
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
      setMsgExito('✅ ¡Recordatorio programado! Te enviamos un correo de confirmación.');
      setForm(FORM_INICIAL);
      cargarLista();
      // Disparar envío inmediato de la confirmación si estamos en Netlify
      if (window.location.hostname.includes('netlify.app')) {
        fetch('/.netlify/functions/check-reminders').catch(() => {});
      }
    } catch (err) {
      setMsgError('❌ Error al crear el recordatorio. Intenta de nuevo.');
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
  };

  /* ── Render ── */
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>

      {/* ─── Header Responsivo ─── */}
      <header className="app-header">
        <div className="app-header-brand">
          <div className="app-header-icon">🔔</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
              Sistema de Recordatorios
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Notificaciones por WhatsApp y correo electrónico
            </p>
          </div>
        </div>
        <div className="app-header-badges">
          {['pendiente','enviado'].map(e => (
            <span key={e} style={{
              padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
              background: ESTADO_CONFIG[e].bg, color: ESTADO_CONFIG[e].color,
              border: `1px solid ${ESTADO_CONFIG[e].color}44`,
            }}>
              {conteo[e]} {e}s
            </span>
          ))}
        </div>
      </header>

      {/* ─── Layout principal Responsivo ─── */}
      <main className="app-main">

        {/* ════ FORMULARIO ════ */}
        <section className="glass-card glass-card-form">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 22 }}>➕</span>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Nuevo Recordatorio</h2>
          </div>

          {msgExito && <div className="alert alert-ok" style={{ marginBottom: 16 }}>{msgExito}</div>}
          {msgError && <div className="alert alert-err" style={{ marginBottom: 16 }}>{msgError}</div>}

          <form onSubmit={handleSubmit}>

            {/* Sección 1 — Info del evento */}
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--purple)', marginBottom: 10 }}>
              📌 Información del evento
            </p>

            <label className="field-label">Título *</label>
            <input
              className="field-input"
              name="titulo"
              value={form.titulo}
              onChange={onChange}
              placeholder="Ej: Llamada con el doctor"
              autoComplete="off"
              data-gramm="false"
              data-enable-grammarly="false"
            />

            <label className="field-label">Descripción <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
            <textarea
              className="field-input"
              name="descripcion"
              value={form.descripcion}
              onChange={onChange}
              placeholder="Notas adicionales..."
              rows={2}
              style={{ resize: 'vertical' }}
              data-gramm="false"
              data-enable-grammarly="false"
            />

            <div className="divider" />

            {/* Sección 2 — Horario */}
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--blue)', marginBottom: 10 }}>
              📅 Horario
            </p>

            <label className="field-label">Fecha y hora del evento *</label>
            <input
              className="field-input"
              type="datetime-local"
              name="fecha_hora"
              value={form.fecha_hora}
              onChange={onChange}
            />

            <div className="form-grid-row">
              <div>
                <label className="field-label">Avisar con</label>
                <select className="field-input" name="anticipacion" value={form.anticipacion} onChange={onChange}>
                  {ANTICIPACION_OPCIONES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Repetición</label>
                <select className="field-input" name="recurrencia" value={form.recurrencia} onChange={onChange}>
                  {RECURRENCIA_OPCIONES.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divider" />

            {/* Sección 3 — Canal */}
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--emerald)', marginBottom: 10 }}>
              🔔 Notificaciones
            </p>

            <label className="field-label">Enviar por</label>
            <div className="canal-toggle">
              {[
                { val: 'email',    label: '📧 Email' },
                { val: 'whatsapp', label: '📱 WhatsApp' },
                { val: 'ambos',    label: '📱 + 📧 Ambos' },
              ].map(({ val, label }) => (
                <button
                  key={val} type="button"
                  className={`canal-btn${form.canal === val ? ' active' : ''}`}
                  onClick={() => setCanal(val)}
                >
                  {label}
                </button>
              ))}
            </div>

            {(form.canal === 'email' || form.canal === 'ambos') && (
              <>
                <label className="field-label">
                  Correo(s) *{' '}
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— separa varios con coma</span>
                </label>
                <input
                  className="field-input"
                  type="text"
                  name="destinatario_email"
                  value={form.destinatario_email}
                  onChange={onChange}
                  placeholder="tu@correo.com, otro@correo.com"
                />
                <p className="hint">📧 Predeterminado: {EMAIL_DEFAULT}</p>
              </>
            )}

            {(form.canal === 'whatsapp' || form.canal === 'ambos') && (
              <>
                <label className="field-label">
                  Número(s) WhatsApp *{' '}
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— con código de país</span>
                </label>
                <input
                  className="field-input"
                  name="destinatario_wa"
                  value={form.destinatario_wa}
                  onChange={onChange}
                  placeholder="5212229137794, 5218001234567"
                />
                <p className="hint">⚠️ Cada número debe activar CallMeBot una vez.</p>
              </>
            )}

            <button className="btn-primary" type="submit" disabled={enviando} style={{ marginTop: 22 }}>
              {enviando
                ? <><span className="spinner" />Guardando...</>
                : '🔔 Crear Recordatorio'
              }
            </button>
          </form>
        </section>

        {/* ════ LISTA ════ */}
        <section className="glass-card glass-card-list">
          {/* Cabecera lista */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>📋 Mis Recordatorios</h2>
            <button className="btn-secondary" onClick={cargarLista} disabled={cargando}>
              {cargando ? '⏳' : '🔄 Actualizar'}
            </button>
          </div>

          {/* Filtros */}
          <div className="filter-tabs" style={{ marginBottom: 18 }}>
            {[
              { key: 'todos',     label: `Todos (${conteo.todos})` },
              { key: 'pendiente', label: `⏳ Pendientes (${conteo.pendiente})` },
              { key: 'enviado',   label: `✅ Enviados (${conteo.enviado})` },
              { key: 'cancelado', label: `❌ Cancelados (${conteo.cancelado})` },
            ].map(f => (
              <button
                key={f.key}
                className={`filter-tab${filtro === f.key ? ' active' : ''}`}
                onClick={() => setFiltro(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Skeletons de carga */}
          {cargando && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1,2,3].map(i => (
                <div key={i} className="skeleton" style={{ height: 90, borderRadius: 12 }} />
              ))}
            </div>
          )}

          {/* Estado vacío */}
          {!cargando && lista.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🔔</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {filtro === 'todos' ? 'No hay recordatorios aún' : `No hay recordatorios ${filtro}s`}
              </p>
              <p style={{ fontSize: 13, marginTop: 6 }}>
                {filtro === 'todos' ? '¡Crea el primero con el formulario! 👈' : 'Prueba otro filtro'}
              </p>
            </div>
          )}

          {/* Lista */}
          <div className="rec-list-container">
            {lista.map((r, idx) => (
              <div
                key={r.id}
                className="rec-item"
                style={{
                  opacity: r.estado === 'cancelado' ? 0.55 : 1,
                  animationDelay: `${idx * 0.05}s`,
                  borderLeft: `3px solid ${ESTADO_CONFIG[r.estado]?.dot || '#a78bfa'}`,
                }}
              >
                {/* Cabecera item responsiva */}
                <div className="rec-item-header">
                  <div className="rec-item-title-box">
                    <p style={{ fontWeight: 700, fontSize: 15, color: '#fff', marginBottom: r.descripcion ? 4 : 0 }}>
                      {r.titulo}
                    </p>
                    {r.descripcion && (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.descripcion}</p>
                    )}
                  </div>
                  <div className="rec-item-badges">
                    <BadgeCanal canal={r.canal} />
                    <BadgeEstado estado={r.estado} />
                  </div>
                </div>

                {/* Detalles */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 10,
                  marginTop: 10, fontSize: 12, color: 'var(--text-muted)',
                }}>
                  <span>📅 {fmtFecha(r.fecha_hora)}</span>
                  <span style={{ color: r.estado === 'pendiente' ? 'var(--amber)' : 'var(--text-muted)', fontWeight: r.estado === 'pendiente' ? 600 : 400 }}>
                    🕐 {tiempoRelativo(r.fecha_hora)}
                  </span>
                  <span>⏰ {
                    r.anticipacion < 60 ? `${r.anticipacion}m antes`
                    : r.anticipacion === 1440 ? '1 día antes'
                    : `${r.anticipacion / 60}h antes`
                  }</span>
                  {r.recurrencia !== 'ninguna' && (
                    <span>🔁 {r.recurrencia.charAt(0).toUpperCase() + r.recurrencia.slice(1)}</span>
                  )}
                </div>

                {/* Destinatarios */}
                <div className="rec-item-recipients" style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', opacity: 0.75 }}>
                  {r.destinatario_email && <span>📧 {r.destinatario_email}</span>}
                  {r.destinatario_wa    && <span style={{ marginLeft: 10 }}>📱 {r.destinatario_wa}</span>}
                </div>

                {/* Acción cancelar */}
                {r.estado === 'pendiente' && (
                  <button
                    className="btn-cancel-item"
                    style={{ marginTop: 10 }}
                    onClick={() => handleCancelar(r.id)}
                  >
                    ✕ Cancelar
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
