import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// ── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

// ── Nodemailer SMTP ─────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const CALLMEBOT_APIKEY = process.env.CALLMEBOT_API_KEY;

function parsearDestinatarios(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function calcularProximaFecha(fechaHora, recurrencia) {
  const fecha = new Date(fechaHora);
  switch (recurrencia) {
    case 'diario':   fecha.setDate(fecha.getDate() + 1);   break;
    case 'semanal':  fecha.setDate(fecha.getDate() + 7);   break;
    case 'mensual':  fecha.setMonth(fecha.getMonth() + 1); break;
  }
  return fecha.toISOString();
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
  if (rec.recurrencia === 'diario')   rrule = '\r\nRRULE:FREQ=DAILY';
  else if (rec.recurrencia === 'semanal')  rrule = '\r\nRRULE:FREQ=WEEKLY';
  else if (rec.recurrencia === 'mensual')  rrule = '\r\nRRULE:FREQ=MONTHLY';

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
    'END:VCALENDAR'
  ].join('\r\n');
}

function generarHtmlEmail(rec) {
  const fecha = new Date(rec.fecha_hora).toLocaleString('es-MX', {
    dateStyle: 'full', timeStyle: 'short',
  });
  const { googleUrl, outlookUrl } = generarLinksCalendario(rec);

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recordatorio: ${rec.titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#6C63FF 0%,#3B82F6 100%);padding:32px 32px 24px;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">⏰</div>
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">¡Es la hora de tu recordatorio!</h1>
    </div>
    <div style="padding:28px 32px;">
      <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">${rec.titulo}</h2>
      ${rec.descripcion ? `<p style="color:#555;margin:0 0 16px;font-size:15px;line-height:1.5;">${rec.descripcion}</p>` : ''}
      <div style="background:#f0f4f8;border-radius:10px;padding:14px 18px;margin:16px 0;">
        <p style="margin:0;color:#374151;font-size:14px;">
          📅 <strong>Fecha del evento:</strong> ${fecha}
        </p>
        ${rec.recurrencia !== 'ninguna' ? `
        <p style="margin:8px 0 0;color:#374151;font-size:14px;">
          🔁 <strong>Recurrencia:</strong> ${rec.recurrencia.charAt(0).toUpperCase() + rec.recurrencia.slice(1)}
        </p>` : ''}
      </div>

      <div style="margin:24px 0 12px;padding:18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
        <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#334155;">
          🗓️ Añade este evento a tu calendario:
        </p>
        <div style="display:inline-block;margin:0 4px 6px;">
          <a href="${googleUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;background:#4285F4;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">
            + Google Calendar
          </a>
        </div>
        <div style="display:inline-block;margin:0 4px 6px;">
          <a href="${outlookUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;background:#0078D4;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">
            + Outlook Calendar
          </a>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">
          📎 También incluye archivo <strong>.ics</strong> para Apple Calendar y otros.
        </p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Enviado automáticamente por tu Sistema de Recordatorios 🔔</p>
    </div>
  </div>
</body>
</html>`;
}

async function guardarLog(recordatorioId, canal, destinatario, estado, errorMsg = null) {
  await supabase.from('logs_envios').insert({
    recordatorio_id: recordatorioId,
    canal,
    destinatario,
    estado,
    error_msg: errorMsg,
  });
}

// ── Handler de Netlify Function ─────────────────────────────────────────────
export default async function handler(req, context) {
  // Opcional: Proteger con token secreto si se define CRON_SECRET en Netlify
  const authHeader = req.headers.get?.('authorization') || '';
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  try {
    const { data: recordatorios, error } = await supabase
      .from('v_recordatorios_pendientes')
      .select('*');

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!recordatorios || recordatorios.length === 0) {
      return new Response(JSON.stringify({ message: 'Sin recordatorios pendientes', procesados: 0 }), { status: 200 });
    }

    const resultados = [];

    for (const rec of recordatorios) {
      const res = { id: rec.id, titulo: rec.titulo, email: false, whatsapp: false };

      // 1. WhatsApp
      if (rec.canal === 'whatsapp' || rec.canal === 'ambos') {
        const numeros = parsearDestinatarios(rec.destinatario_wa);
        for (const numero of numeros) {
          const { googleUrl } = generarLinksCalendario(rec);
          const mensaje = `⏰ *¡Recordatorio!* ${rec.titulo}${rec.descripcion ? `\n\n${rec.descripcion}` : ''}\n\n🗓️ Agendar en Google Calendar:\n${googleUrl}`;
          const url = `https://api.callmebot.com/whatsapp.php?phone=${numero}&text=${encodeURIComponent(mensaje)}&apikey=${CALLMEBOT_APIKEY}`;
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              await guardarLog(rec.id, 'whatsapp', numero, 'ok');
              res.whatsapp = true;
            } else {
              throw new Error(`HTTP ${resp.status}`);
            }
          } catch (e) {
            await guardarLog(rec.id, 'whatsapp', numero, 'error', e.message);
          }
        }
      }

      // 2. Email con Calendario
      if (rec.canal === 'email' || rec.canal === 'ambos') {
        const correos = parsearDestinatarios(rec.destinatario_email);
        if (correos.length > 0) {
          try {
            const icsContenido = generarIcs(rec);
            const nombreArchivoIcs = `${(rec.titulo || 'recordatorio').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}.ics`;
            const { googleUrl } = generarLinksCalendario(rec);

            await transporter.sendMail({
              from: `"${process.env.EMAIL_FROM_NAME || 'Recordatorios'}" <${process.env.SMTP_USER}>`,
              to: correos.join(', '),
              subject: `⏰ Recordatorio: ${rec.titulo}`,
              html: generarHtmlEmail(rec),
              text: `Recordatorio: ${rec.titulo}\n\n${rec.descripcion || ''}\n\nFecha: ${new Date(rec.fecha_hora).toLocaleString('es-MX')}\n\nAgendar: ${googleUrl}`,
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
            for (const correo of correos) {
              await guardarLog(rec.id, 'email', correo, 'ok');
            }
            res.email = true;
          } catch (e) {
            for (const correo of correos) {
              await guardarLog(rec.id, 'email', correo, 'error', e.message);
            }
          }
        }
      }

      // 3. Actualizar estado / recurrencia
      if (rec.recurrencia && rec.recurrencia !== 'ninguna') {
        const proximaFecha = calcularProximaFecha(rec.fecha_hora, rec.recurrencia);
        await supabase
          .from('recordatorios')
          .update({ fecha_hora: proximaFecha, estado: 'pendiente' })
          .eq('id', rec.id);
      } else {
        await supabase
          .from('recordatorios')
          .update({ estado: 'enviado' })
          .eq('id', rec.id);
      }

      resultados.push(res);
    }

    return new Response(JSON.stringify({ message: 'Procesado con éxito', total: resultados.length, resultados }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
