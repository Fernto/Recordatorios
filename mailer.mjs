import 'dotenv/config';
import nodemailer from 'nodemailer';
import { supabase } from './db.mjs';

// ── Transporte SMTP ──────────────────────────────────────────────────────────
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const REMITENTE_NOMBRE = process.env.EMAIL_FROM_NAME || 'Recordatorios';
const DURACION_EVENTO_MS = 60 * 60 * 1000; // 1 hora estimada

// ── Helpers de formato ───────────────────────────────────────────────────────

/** Divide "a@x.com, b@y.com" → ["a@x.com", "b@y.com"]. */
export function parsearDestinatarios(str) {
  if (!str) return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Texto de una sola línea, seguro para asuntos y cabeceras. */
function unaLinea(texto, fallback = '') {
  const limpio = String(texto ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return limpio || fallback;
}

/** Escape para HTML: evita que el título o la descripción inyecten marcado. */
export function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape de valores de texto según RFC 5545 (iCalendar). */
export function escaparIcs(texto) {
  return String(texto ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Plegado de líneas largas del .ics (recomendado por RFC 5545). */
function plegarLineaIcs(linea) {
  if (linea.length <= 74) return linea;
  const partes = [];
  let resto = linea;
  while (resto.length > 74) {
    partes.push(resto.slice(0, 74));
    resto = ` ${resto.slice(74)}`;
  }
  partes.push(resto);
  return partes.join('\r\n');
}

function formatoIcsUtc(fecha) {
  return `${fecha.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

function rruleDe(recurrencia) {
  if (recurrencia === 'diario') return 'RRULE:FREQ=DAILY';
  if (recurrencia === 'semanal') return 'RRULE:FREQ=WEEKLY';
  if (recurrencia === 'mensual') return 'RRULE:FREQ=MONTHLY';
  return '';
}

/** Describe la anticipación en lenguaje natural. */
export function textoAnticipacion(minutos) {
  const valor = Number(minutos);
  if (!Number.isFinite(valor)) return 'sin anticipación';
  if (valor < 60) return `${valor} minutos antes`;
  if (valor === 1440) return '1 día antes';
  if (valor % 1440 === 0) return `${valor / 1440} día(s) antes`;
  return `${valor / 60} hora(s) antes`;
}

/** Enlaces directos a Google Calendar y Outlook Web. */
export function generarLinksCalendario(rec) {
  const inicio = new Date(rec.fecha_hora);
  const fin = new Date(inicio.getTime() + DURACION_EVENTO_MS);

  const gStart = formatoIcsUtc(inicio);
  const gEnd = formatoIcsUtc(fin);

  const titulo = encodeURIComponent(unaLinea(rec.titulo, 'Recordatorio'));
  const descripcion = encodeURIComponent(rec.descripcion || 'Recordatorio programado');

  const googleUrl =
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}` +
    `&details=${descripcion}&dates=${gStart}/${gEnd}`;

  const outlookUrl =
    `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose` +
    `&rru=addevent&subject=${titulo}&body=${descripcion}` +
    `&startdt=${inicio.toISOString()}&enddt=${fin.toISOString()}`;

  return { googleUrl, outlookUrl };
}

/** .ics estándar (RFC 5545) compatible con Google, Apple, Outlook, etc. */
export function generarIcs(rec) {
  const inicio = new Date(rec.fecha_hora);
  const fin = new Date(inicio.getTime() + DURACION_EVENTO_MS);
  const uid = `${rec.id || Date.now()}@recordatorios-app`;

  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sistema de Recordatorios//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatoIcsUtc(new Date())}`,
    `DTSTART:${formatoIcsUtc(inicio)}`,
    `DTEND:${formatoIcsUtc(fin)}`,
    `SUMMARY:${escaparIcs(unaLinea(rec.titulo, 'Recordatorio'))}`,
    `DESCRIPTION:${escaparIcs(rec.descripcion || 'Recordatorio programado')}`,
  ];

  const rrule = rruleDe(rec.recurrencia);
  if (rrule) lineas.push(rrule);

  // METHOD:REQUEST sin ORGANIZER no es válido; Gmail/Outlook lo toleran mal.
  if (process.env.SMTP_USER) {
    lineas.push(`ORGANIZER;CN=${escaparIcs(REMITENTE_NOMBRE)}:mailto:${process.env.SMTP_USER}`);
  }

  lineas.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR');
  return lineas.map(plegarLineaIcs).join('\r\n');
}

function nombreArchivoIcs(prefijo, titulo) {
  const slug = unaLinea(titulo, 'evento')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  return `${prefijo}_${slug || 'evento'}.ics`;
}

// ── Plantillas HTML ──────────────────────────────────────────────────────────

function bloqueDescripcion(descripcion) {
  if (!descripcion) return '';
  const seguro = escaparHtml(descripcion).replace(/\r?\n/g, '<br>');
  return `<p style="color:#555;margin:0 0 16px;font-size:15px;line-height:1.5;">${seguro}</p>`;
}

function bloqueCalendario(googleUrl, outlookUrl, nota) {
  return `
      <div style="margin:24px 0 12px;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#334155;">🗓️ ${nota}</p>
        <div style="display:inline-block;margin:0 4px 6px;">
          <a href="${googleUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#4285F4;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">+ Google Calendar</a>
        </div>
        <div style="display:inline-block;margin:0 4px 6px;">
          <a href="${outlookUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0078D4;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">+ Outlook Calendar</a>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">📎 El correo incluye el archivo <strong>.ics</strong> para Apple Calendar y otros dispositivos.</p>
      </div>`;
}

function envoltorio(tituloDocumento, cabecera, cuerpo) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escaparHtml(tituloDocumento)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
${cabecera}
${cuerpo}
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Enviado automáticamente por tu Sistema de Recordatorios 🔔</p>
    </div>
  </div>
</body>
</html>`;
}

/** Correo de aviso: se acerca la hora del evento. */
export function generarHtmlEmailAviso(rec) {
  const fecha = new Date(rec.fecha_hora).toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const { googleUrl, outlookUrl } = generarLinksCalendario(rec);
  const titulo = escaparHtml(rec.titulo || 'Recordatorio');

  const cabecera = `
    <div style="background:linear-gradient(135deg,#6C63FF 0%,#3B82F6 100%);padding:32px 32px 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">⏰</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">¡Es la hora de tu recordatorio!</h1>
    </div>`;

  const cuerpo = `
    <div style="padding:28px 32px;">
      <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">${titulo}</h2>
      ${bloqueDescripcion(rec.descripcion)}
      <div style="background:#f0f4f8;border-radius:10px;padding:14px 18px;margin:16px 0;">
        <p style="margin:0;color:#374151;font-size:14px;">📅 <strong>Fecha del evento:</strong> ${escaparHtml(fecha)}</p>
        ${
          rec.recurrencia && rec.recurrencia !== 'ninguna'
            ? `<p style="margin:8px 0 0;color:#374151;font-size:14px;">🔁 <strong>Recurrencia:</strong> ${escaparHtml(rec.recurrencia)}</p>`
            : ''
        }
      </div>
${bloqueCalendario(googleUrl, outlookUrl, 'Añade este evento a tu calendario:')}
    </div>`;

  return envoltorio(`Recordatorio: ${unaLinea(rec.titulo, 'Recordatorio')}`, cabecera, cuerpo);
}

/** Correo de confirmación: el recordatorio quedó agendado. */
export function generarHtmlEmailConfirmacion(rec) {
  const fecha = new Date(rec.fecha_hora).toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const { googleUrl, outlookUrl } = generarLinksCalendario(rec);
  const titulo = escaparHtml(rec.titulo || 'Recordatorio');

  const cabecera = `
    <div style="background:linear-gradient(135deg,#059669 0%,#2563eb 100%);padding:32px 32px 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">🎉</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">¡Recordatorio Agendado con Éxito!</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Hemos registrado tu evento en el sistema</p>
    </div>`;

  const cuerpo = `
    <div style="padding:28px 32px;">
      <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">${titulo}</h2>
      ${bloqueDescripcion(rec.descripcion)}

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 18px;margin:16px 0;">
        <p style="margin:0 0 8px;color:#166534;font-size:14px;">📅 <strong>Fecha programada:</strong> ${escaparHtml(fecha)}</p>
        <p style="margin:0 0 8px;color:#166534;font-size:14px;">⏰ <strong>Te notificaremos:</strong> ${escaparHtml(textoAnticipacion(rec.anticipacion))}</p>
        ${
          rec.recurrencia && rec.recurrencia !== 'ninguna'
            ? `<p style="margin:0 0 8px;color:#166534;font-size:14px;">🔁 <strong>Repetición:</strong> ${escaparHtml(rec.recurrencia)}</p>`
            : ''
        }
        <p style="margin:0;color:#166534;font-size:14px;">🔔 <strong>Canal de aviso:</strong> ${escaparHtml((rec.canal || 'ambos').toUpperCase())}</p>
      </div>
${bloqueCalendario(googleUrl, outlookUrl, 'Guarda este evento ahora en tu calendario:')}

      <p style="font-size:13px;color:#64748b;text-align:center;margin-top:20px;">
        💡 <em>Te enviaremos otro correo cuando se acerque la hora de tu evento.</em>
      </p>
    </div>`;

  return envoltorio(`Confirmación: ${unaLinea(rec.titulo, 'Recordatorio')}`, cabecera, cuerpo);
}

// ── Registro de envíos ───────────────────────────────────────────────────────

export async function guardarLog(recordatorioId, canal, destinatario, estado, errorMsg = null) {
  try {
    const { error } = await supabase.from('logs_envios').insert({
      recordatorio_id: recordatorioId,
      canal,
      destinatario,
      estado,
      error_msg: errorMsg,
    });
    if (error) console.warn(`⚠️ No se pudo guardar log: ${error.message}`);
  } catch (err) {
    console.warn(`⚠️ No se pudo guardar log: ${err.message}`);
  }
}

// ── Envío de correo ──────────────────────────────────────────────────────────

async function enviarCorreo(rec, tipo) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Faltan SMTP_USER y SMTP_PASS en el entorno');
  }

  const correos = parsearDestinatarios(rec.destinatario_email);
  if (correos.length === 0) throw new Error('Sin correos destinatarios');

  const { googleUrl } = generarLinksCalendario(rec);
  const esConfirmacion = tipo === 'confirmacion';
  const titulo = unaLinea(rec.titulo, 'Recordatorio');
  const fecha = new Date(rec.fecha_hora).toLocaleString('es-MX');
  const ics = generarIcs(rec);

  const texto = esConfirmacion
    ? `¡Recordatorio Agendado con Éxito!\n\nEvento: ${titulo}\nFecha: ${fecha}\n` +
      `Te notificaremos: ${textoAnticipacion(rec.anticipacion)}\n\nAgendar en Google Calendar: ${googleUrl}`
    : `Recordatorio: ${titulo}\n\n${rec.descripcion || ''}\n\nFecha: ${fecha}\n\nAgendar en Google Calendar: ${googleUrl}`;

  const info = await transporter.sendMail({
    from: `"${REMITENTE_NOMBRE}" <${process.env.SMTP_USER}>`,
    to: correos.join(', '),
    subject: esConfirmacion
      ? `✅ Confirmación: Recordatorio programado "${titulo}"`
      : `⏰ Recordatorio: ${titulo}`,
    html: esConfirmacion ? generarHtmlEmailConfirmacion(rec) : generarHtmlEmailAviso(rec),
    text: texto,
    // icalEvent genera la parte text/calendar correcta para invitaciones.
    // No se adjunta además como attachment: eso duplicaba la invitación.
    icalEvent: {
      filename: nombreArchivoIcs(esConfirmacion ? 'confirmacion' : 'recordatorio', rec.titulo),
      method: 'REQUEST',
      content: ics,
    },
  });

  return { info, correos };
}

// ── WhatsApp (CallMeBot) ─────────────────────────────────────────────────────

async function enviarWhatsApp(numero, mensaje) {
  const apikey = process.env.CALLMEBOT_API_KEY;
  if (!apikey) throw new Error('Falta CALLMEBOT_API_KEY en el entorno');

  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(numero)}` +
    `&text=${encodeURIComponent(mensaje)}&apikey=${encodeURIComponent(apikey)}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`CallMeBot HTTP ${resp.status}`);

  // CallMeBot responde 200 con texto de error cuando la API key o el número fallan.
  const cuerpo = await resp.text();
  if (/invalid|error|no api ?key/i.test(cuerpo)) {
    throw new Error(`CallMeBot: ${cuerpo.slice(0, 120).trim()}`);
  }
}

function mensajeWhatsApp(rec) {
  const { googleUrl } = generarLinksCalendario(rec);
  const titulo = unaLinea(rec.titulo, 'Recordatorio');
  return (
    `⏰ *¡Recordatorio!* ${titulo}` +
    `${rec.descripcion ? `\n\n${rec.descripcion}` : ''}` +
    `\n\n🗓️ Agendar en Google Calendar:\n${googleUrl}`
  );
}

// ── Confirmación de agendado (exactamente una vez) ───────────────────────────

/**
 * Reclama la confirmación de forma atómica: solo el proceso que consigue poner
 * `confirmacion_enviada = true` (partiendo de false) envía el correo.
 * Evita duplicados entre el endpoint HTTP y el worker.
 */
async function reclamarConfirmacion(id) {
  const { data, error } = await supabase
    .from('recordatorios')
    .update({ confirmacion_enviada: true })
    .eq('id', id)
    .eq('confirmacion_enviada', false)
    .eq('estado', 'pendiente')
    .select('id');

  if (error) throw new Error(`No se pudo reclamar la confirmación: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

async function marcarConfirmacion(id, valor) {
  const { error } = await supabase
    .from('recordatorios')
    .update({ confirmacion_enviada: valor })
    .eq('id', id);
  if (error) console.warn(`⚠️ No se pudo actualizar confirmacion_enviada: ${error.message}`);
}

/**
 * Envía el correo de confirmación de agendado de un recordatorio.
 * Idempotente: si ya se envió, no repite.
 * Si el envío falla, libera la marca para que el worker lo reintente.
 */
export async function enviarConfirmacion(rec) {
  // Canales sin email: solo dejamos la marca para que el worker no vuelva a mirarlo.
  if (rec.canal !== 'email' && rec.canal !== 'ambos') {
    await marcarConfirmacion(rec.id, true);
    return { ok: true, saltado: true, motivo: 'Canal sin email' };
  }

  const correos = parsearDestinatarios(rec.destinatario_email);
  if (correos.length === 0) {
    await marcarConfirmacion(rec.id, true);
    return { ok: true, saltado: true, motivo: 'Sin destinatarios de email' };
  }

  const reclamada = await reclamarConfirmacion(rec.id);
  if (!reclamada) {
    return { ok: true, saltado: true, motivo: 'La confirmación ya fue enviada' };
  }

  try {
    const { info } = await enviarCorreo(rec, 'confirmacion');
    await Promise.all(correos.map((c) => guardarLog(rec.id, 'email', c, 'ok')));
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    // Liberamos la marca: así el worker reintenta en el siguiente ciclo.
    await marcarConfirmacion(rec.id, false);
    await Promise.all(correos.map((c) => guardarLog(rec.id, 'email', c, 'error', e.message)));
    return { ok: false, error: e.message };
  }
}

// ── Aviso de recordatorio (WhatsApp + email) ─────────────────────────────────

/**
 * Envía el aviso de un recordatorio por los canales configurados.
 * Devuelve qué canales funcionaron y los errores encontrados.
 */
export async function enviarAviso(rec) {
  const resultado = { email: false, whatsapp: false, errores: [] };

  if (rec.canal === 'whatsapp' || rec.canal === 'ambos') {
    const numeros = parsearDestinatarios(rec.destinatario_wa);
    if (numeros.length === 0) {
      resultado.errores.push('WhatsApp: sin números configurados');
    }
    for (const numero of numeros) {
      try {
        await enviarWhatsApp(numero, mensajeWhatsApp(rec));
        await guardarLog(rec.id, 'whatsapp', numero, 'ok');
        resultado.whatsapp = true;
        console.log(`  📱 WhatsApp enviado → ${numero}`);
      } catch (e) {
        await guardarLog(rec.id, 'whatsapp', numero, 'error', e.message);
        resultado.errores.push(`WhatsApp ${numero}: ${e.message}`);
        console.error(`  ❌ WhatsApp falló para ${numero}:`, e.message);
      }
    }
  }

  if (rec.canal === 'email' || rec.canal === 'ambos') {
    try {
      const { info, correos } = await enviarCorreo(rec, 'aviso');
      await Promise.all(correos.map((c) => guardarLog(rec.id, 'email', c, 'ok')));
      resultado.email = true;
      console.log(`  📧 Email enviado → ${correos.join(', ')} (MsgId: ${info.messageId})`);
    } catch (e) {
      for (const c of parsearDestinatarios(rec.destinatario_email)) {
        await guardarLog(rec.id, 'email', c, 'error', e.message);
      }
      resultado.errores.push(`Email: ${e.message}`);
      console.error('  ❌ Email falló:', e.message);
    }
  }

  return resultado;
}
