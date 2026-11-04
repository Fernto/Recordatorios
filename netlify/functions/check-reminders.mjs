import { procesarCiclo } from '../../worker.mjs';

function json(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Endpoint para un cron externo (cron-job.org, EasyCron, etc.).
 * Si CRON_SECRET está definido, exige `Authorization: Bearer <secreto>`.
 */
export default async function handler(req) {
  const secreto = process.env.CRON_SECRET;
  if (secreto) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secreto}`) {
      return json(401, { ok: false, error: 'No autorizado' });
    }
  }

  try {
    const resumen = await procesarCiclo();
    return json(200, {
      ok: true,
      confirmaciones: resumen.confirmaciones.length,
      avisos: resumen.avisos.length,
      recuperados: resumen.recuperados.length,
      vencidos: resumen.vencidos.length,
      detalles: resumen,
    });
  } catch (e) {
    console.error('❌ Error procesando el ciclo:', e.message);
    return json(500, { ok: false, error: 'Error procesando el ciclo' });
  }
}
