import { supabase } from '../../db.mjs';
import { enviarConfirmacion } from '../../mailer.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Solo se atiende al mismo sitio o a un cliente con el token compartido.
 * El contenido a enviar NUNCA viene del cliente: se lee de la base de datos.
 */
function autorizado(req) {
  const token = process.env.CONFIRMATION_API_TOKEN;
  const auth = req.headers.get('authorization') || '';
  if (token && auth === `Bearer ${token}`) return true;

  const origin = req.headers.get('origin');
  if (!origin) return true; // llamadas servidor-a-servidor o curl sin Origin

  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Método no permitido' });
  }

  if (!autorizado(req)) {
    return json(403, { ok: false, error: 'Origen no permitido' });
  }

  let cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return json(400, { ok: false, error: 'JSON inválido' });
  }

  const id = typeof cuerpo?.id === 'string' ? cuerpo.id.trim() : '';
  if (!UUID_RE.test(id)) {
    return json(400, { ok: false, error: 'Se requiere el id (UUID) del recordatorio' });
  }

  const { data: rec, error } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('❌ Error consultando el recordatorio:', error.message);
    return json(500, { ok: false, error: 'No se pudo consultar el recordatorio' });
  }
  if (!rec) {
    return json(404, { ok: false, error: 'Recordatorio no encontrado' });
  }

  const resultado = await enviarConfirmacion(rec);

  if (resultado.error) {
    // El worker lo reintentará: la marca de confirmación se liberó.
    return json(502, { ok: false, error: 'No se pudo enviar la confirmación; se reintentará' });
  }

  return json(200, {
    ok: true,
    saltado: Boolean(resultado.saltado),
    messageId: resultado.messageId || null,
  });
}
