import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

// ── Supabase ────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://uhyrhqvrocbupgfnbjxu.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeXJocXZyb2NidXBnZm5ianh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NjI2MDQsImV4cCI6MjEwNjUzODYwNH0.5JCg5NZMA0qDpq3AmynIc6RjGiZrJudJRbfY0GhPnRo';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// ── Nodemailer SMTP ─────────────────────────────────────────────────────────
const SMTP_USER = process.env.SMTP_USER || 'villalbafernando450@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || 'ywnb nyel cezb rlpq';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

function parsearDestinatarios(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function generarLinksCalendario(rec) {
  const inicio = new Date(rec.fecha_hora);
  const fin = new Date(inicio.getTime() + 60 * 60 * 1000);

  const formatoIsoUtc = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const gStart = formatoIsoUtc(inicio);
  const gEnd = formatoIsoUtc(fin);

  const titulo = encodeURIComponent(rec.titulo || 'Recordatorio');
  const descripcion = encodeURIComponent(rec.descripcion || 'Recordatorio programado');

  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${titulo}&details=${descripcion}&dates=${gStart}/${gEnd}`;
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${titulo}&body=${descripcion}&startdt=${inicio.toISOString()}&enddt=${fin.toISOString()}`;

  return { googleUrl, outlookUrl };
}

function generarIcs(rec) {
  const inicio = new Date(rec.fecha_hora);
  const fin = new Date(inicio.getTime() + 60 * 60 * 1000);

  const formatoIsoUtc = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dtStamp = formatoIsoUtc(new Date());
  const dtStart = formatoIsoUtc(inicio);
  const dtEnd = formatoIsoUtc(fin);

  const cleanTitle = (rec.titulo || 'Recordatorio').replace(/[\r\n]+/g, ' ');
  const cleanDesc = (rec.descripcion || '').replace(/[\r\n]+/g, '\\n');
  const uid = `${rec.id || Date.now()}@recordatorios-app`;

  let rrule = '';
  if (rec.recurrencia === 'diario') rrule = '\r\nRRULE:FREQ=DAILY';
  else if (rec.recurrencia === 'semanal') rrule = '\r\nRRULE:FREQ=WEEKLY';
  else if (rec.recurrencia === 'mensual') rrule = '\r\nRRULE:FREQ=MONTHLY';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sistema de Recordatorios//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${cleanTitle}`,
    `DESCRIPTION:${cleanDesc}${rrule}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function generarHtmlEmailConfirmacion(rec) {
  const fecha = new Date(rec.fecha_hora).toLocaleString('es-MX', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const { googleUrl, outlookUrl } = generarLinksCalendario(rec);
  const textoAnticipacion =
    rec.anticipacion < 60
      ? `${rec.anticipacion} minutos antes`
      : rec.anticipacion === 1440
      ? '1 día antes'
      : `${rec.anticipacion / 60} hora(s) antes`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación: ${rec.titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#059669 0%,#2563eb 100%);padding:32px 32px 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">🎉</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">¡Recordatorio Agendado con Éxito!</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Hemos registrado tu evento en el sistema</p>
    </div>
    <div style="padding:28px 32px;">
      <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">${rec.titulo}</h2>
      ${rec.descripcion ? `<p style="color:#555;margin:0 0 16px;font-size:15px;line-height:1.5;">${rec.descripcion}</p>` : ''}
      
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 18px;margin:16px 0;">
        <p style="margin:0 0 8px;color:#166534;font-size:14px;">
          📅 <strong>Fecha programada:</strong> ${fecha}
        </p>
        <p style="margin:0 0 8px;color:#166534;font-size:14px;">
          ⏰ <strong>Te notificaremos:</strong> ${textoAnticipacion}
        </p>
        ${rec.recurrencia && rec.recurrencia !== 'ninguna' ? `
        <p style="margin:0 0 8px;color:#166534;font-size:14px;">
          🔁 <strong>Repetición:</strong> ${rec.recurrencia.charAt(0).toUpperCase() + rec.recurrencia.slice(1)}
        </p>` : ''}
        <p style="margin:0;color:#166534;font-size:14px;">
          🔔 <strong>Canal de aviso:</strong> ${(rec.canal || 'ambos').toUpperCase()}
        </p>
      </div>

      <div style="margin:24px 0 12px;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#334155;">
          🗓️ Guarda este evento ahora en tu calendario:
        </p>
        <div style="display:inline-block;margin:0 4px 6px;">
          <a href="${googleUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;background:#4285F4;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 2px 6px rgba(66,133,244,0.3);">
            + Google Calendar
          </a>
        </div>
        <div style="display:inline-block;margin:0 4px 6px;">
          <a href="${outlookUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;background:#0078D4;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 2px 6px rgba(0,120,212,0.3);">
            + Outlook Calendar
          </a>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">
          📎 También se adjuntó el archivo <strong>.ics</strong> para Apple Calendar y otros.
        </p>
      </div>
      
      <p style="font-size:13px;color:#64748b;text-align:center;margin-top:20px;">
        💡 <em>Te volveremos a enviar un correo de recordatorio cuando se acerque la hora de tu evento.</em>
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Enviado por tu Sistema de Recordatorios 🔔</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Handler Serverless de Netlify ───────────────────────────────────────────
export default async function handler(req, context) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const rec = await req.json();

    if (rec.canal !== 'email' && rec.canal !== 'ambos') {
      return new Response(JSON.stringify({ ok: true, saltado: true, motivo: 'Canal sin email' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const correos = parsearDestinatarios(rec.destinatario_email);
    if (correos.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'Sin correos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const icsContenido = generarIcs(rec);
    const nombreArchivoIcs = `confirmacion_${(rec.titulo || 'evento').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 25)}.ics`;
    const { googleUrl } = generarLinksCalendario(rec);

    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Recordatorios'}" <${SMTP_USER}>`,
      to: correos.join(', '),
      subject: `✅ Confirmación: Recordatorio programado "${rec.titulo}"`,
      html: generarHtmlEmailConfirmacion(rec),
      text: `¡Recordatorio Agendado con Éxito!\n\nEvento: ${rec.titulo}\nFecha: ${new Date(rec.fecha_hora).toLocaleString('es-MX')}\n\nAgendar en Google Calendar: ${googleUrl}`,
      icalEvent: {
        filename: nombreArchivoIcs,
        method: 'REQUEST',
        content: icsContenido,
      },
      attachments: [
        {
          filename: nombreArchivoIcs,
          content: icsContenido,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST',
        },
      ],
    });

    console.log(`📧 Confirmación enviada a: ${correos.join(', ')} (MsgId: ${info.messageId})`);

    // Intentar actualizar en Supabase confirmacion_enviada = true
    try {
      if (rec.id) {
        await supabase
          .from('recordatorios')
          .update({ confirmacion_enviada: true })
          .eq('id', rec.id);
      }
    } catch (e) {
      console.warn('No se pudo actualizar confirmacion_enviada en DB:', e.message);
    }

    return new Response(JSON.stringify({ ok: true, messageId: info.messageId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('❌ Error enviando confirmación en Netlify Function:', err);
    return new Response(JSON.stringify({ ok: false, error: err.message, stack: err.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
