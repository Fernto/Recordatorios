import { supabase } from './db.mjs';
import { enviarConfirmacion, enviarAviso } from './mailer.mjs';

// Ventana de gracia: un recordatorio cuya hora pasó hace más de 1 hora ya no se
// envía (evita avisos zombie tras una caída del worker).
export const VENTANA_GRACIA_MS = 60 * 60 * 1000;

// Máximo de ocurrencias que se avanzan de golpe al recuperar una recurrencia.
const MAX_ITERACIONES = 500;

// ── Fechas ───────────────────────────────────────────────────────────────────

/** Suma un mes calendario respetando el fin de mes (31 ene → 28/29 feb). */
function sumarMes(fecha, meses) {
  const dia = fecha.getDate();
  const destino = new Date(fecha);
  destino.setDate(1);
  destino.setMonth(destino.getMonth() + meses);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimoDia));
  return destino;
}

/** Siguiente ocurrencia de un recordatorio a partir de su fecha actual. */
export function siguienteOcurrencia(fechaHora, recurrencia) {
  const fecha = new Date(fechaHora);
  if (Number.isNaN(fecha.getTime())) return null;

  switch (recurrencia) {
    case 'diario':
      fecha.setDate(fecha.getDate() + 1);
      return fecha;
    case 'semanal':
      fecha.setDate(fecha.getDate() + 7);
      return fecha;
    case 'mensual':
      return sumarMes(fecha, 1);
    default:
      return null;
  }
}

/**
 * Avanza la recurrencia hasta la primera ocurrencia futura.
 * Así una recurrencia no se queda atascada si el worker estuvo caído varios días.
 */
export function proximaFechaFutura(fechaHora, recurrencia, desde = new Date(), maxIteraciones = MAX_ITERACIONES) {
  let fecha = new Date(fechaHora);
  if (Number.isNaN(fecha.getTime())) return null;

  for (let i = 0; i < maxIteraciones && fecha <= desde; i += 1) {
    const siguiente = siguienteOcurrencia(fecha, recurrencia);
    if (!siguiente) return null;
    fecha = siguiente;
  }

  return fecha > desde ? fecha : null;
}

// ── Fases del ciclo ──────────────────────────────────────────────────────────

const ESTADOS = { pendiente: 'pendiente', enviado: 'enviado', cancelado: 'cancelado', vencido: 'vencido' };

// Si la base de datos todavía no acepta el estado 'vencido' (migración sin
// aplicar), dejamos de intentarlo para no llenar el log de errores.
let estadoVencidoSoportado = true;

async function recuperarRecurrenciasPerdidas(ahora, resumen, log) {
  const limite = new Date(ahora.getTime() - VENTANA_GRACIA_MS).toISOString();

  const { data, error } = await supabase
    .from('recordatorios')
    .select('id, titulo, fecha_hora, recurrencia')
    .eq('estado', ESTADOS.pendiente)
    .neq('recurrencia', 'ninguna')
    .lt('fecha_hora', limite);

  if (error) {
    log(`❌ No se pudieron revisar recurrencias atrasadas: ${error.message}`);
    return;
  }

  for (const rec of data || []) {
    const proxima = proximaFechaFutura(rec.fecha_hora, rec.recurrencia, ahora);
    if (!proxima) continue;

    const { error: errUpd } = await supabase
      .from('recordatorios')
      .update({ fecha_hora: proxima.toISOString() })
      .eq('id', rec.id);

    if (errUpd) {
      log(`  ❌ No se pudo reprogramar "${rec.titulo}": ${errUpd.message}`);
      continue;
    }

    resumen.recuperados.push({ id: rec.id, titulo: rec.titulo, proxima: proxima.toISOString() });
    log(`  🔁 Recurrencia recuperada: "${rec.titulo}" → ${proxima.toLocaleString('es-MX')}`);
  }
}

async function vencerRecordatoriosAtrasados(ahora, resumen, log) {
  if (!estadoVencidoSoportado) return;

  const limite = new Date(ahora.getTime() - VENTANA_GRACIA_MS).toISOString();

  const { data, error } = await supabase
    .from('recordatorios')
    .select('id, titulo, fecha_hora')
    .eq('estado', ESTADOS.pendiente)
    .eq('recurrencia', 'ninguna')
    .lt('fecha_hora', limite);

  if (error) {
    log(`❌ No se pudieron revisar recordatorios atrasados: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) return;

  const { data: actualizados, error: errUpd } = await supabase
    .from('recordatorios')
    .update({ estado: ESTADOS.vencido })
    .in('id', data.map((r) => r.id))
    .select('id, titulo');

  if (errUpd) {
    if (/23514|check constraint|invalid input value/i.test(errUpd.message)) {
      estadoVencidoSoportado = false;
      log(
        '⚠️  La base de datos no acepta el estado "vencido". ' +
          'Ejecuta supabase_migration.sql para habilitarlo (se sigue trabajando sin él).'
      );
    } else {
      log(`❌ No se pudieron marcar recordatorios vencidos: ${errUpd.message}`);
    }
    return;
  }

  for (const rec of actualizados || []) {
    resumen.vencidos.push({ id: rec.id, titulo: rec.titulo });
    log(`  ⌛ Vencido sin enviar: "${rec.titulo}"`);
  }
}

async function enviarConfirmacionesPendientes(resumen, log) {
  const { data, error } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('confirmacion_enviada', false)
    .eq('estado', ESTADOS.pendiente)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    log(`❌ No se pudieron buscar confirmaciones pendientes: ${error.message}`);
    return;
  }

  for (const rec of data || []) {
    log(`  ➜ Confirmación: "${rec.titulo}"`);
    const resultado = await enviarConfirmacion(rec);

    if (resultado.ok) {
      if (!resultado.saltado) log('  ✅ Confirmación enviada.');
      resumen.confirmaciones.push({ id: rec.id, titulo: rec.titulo, ok: true });
    } else {
      log(`  ❌ Confirmación falló: ${resultado.error}`);
      resumen.confirmaciones.push({ id: rec.id, titulo: rec.titulo, ok: false, error: resultado.error });
    }
  }
}

async function enviarAvisosPendientes(ahora, resumen, log) {
  const { data, error } = await supabase.from('v_recordatorios_pendientes').select('*');

  if (error) {
    log(`❌ No se pudieron consultar los recordatorios pendientes: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) return;

  log(`🔔 ${data.length} recordatorio(s) próximo(s) a procesar.`);

  for (const rec of data) {
    log(`  ➜ Aviso: "${rec.titulo}"`);
    const enviado = await enviarAviso(rec);

    // Avanzamos el estado aunque algún canal falle: evita reenviar el mismo
    // aviso en bucle. Los fallos quedan registrados en logs_envios.
    if (rec.recurrencia && rec.recurrencia !== 'ninguna') {
      const proxima = proximaFechaFutura(rec.fecha_hora, rec.recurrencia, ahora);
      const cambios = proxima
        ? { fecha_hora: proxima.toISOString(), estado: ESTADOS.pendiente, confirmacion_enviada: true }
        : { estado: ESTADOS.enviado, confirmacion_enviada: true };

      const { error: errUpd } = await supabase.from('recordatorios').update(cambios).eq('id', rec.id);
      if (errUpd) log(`  ❌ No se pudo reprogramar: ${errUpd.message}`);
      else if (proxima) log(`  🔁 Reprogramado para ${proxima.toLocaleString('es-MX')}`);
    } else {
      const { error: errUpd } = await supabase
        .from('recordatorios')
        .update({ estado: ESTADOS.enviado })
        .eq('id', rec.id);
      if (errUpd) log(`  ❌ No se pudo marcar como enviado: ${errUpd.message}`);
      else log("  ✅ Marcado como 'enviado'.");
    }

    resumen.avisos.push({
      id: rec.id,
      titulo: rec.titulo,
      email: enviado.email,
      whatsapp: enviado.whatsapp,
      errores: enviado.errores,
    });
  }
}

/**
 * Un ciclo completo de trabajo: recuperar recurrencias atrasadas, vencer
 * recordatorios que ya no aplican, enviar confirmaciones y enviar avisos.
 * Lo usan tanto cron.mjs como la función serverless de Netlify.
 */
export async function procesarCiclo({ ahora = new Date(), log } = {}) {
  const registrar = log || ((mensaje) => console.log(mensaje));
  const resumen = { recuperados: [], vencidos: [], confirmaciones: [], avisos: [] };

  await recuperarRecurrenciasPerdidas(ahora, resumen, registrar);
  await vencerRecordatoriosAtrasados(ahora, resumen, registrar);
  await enviarConfirmacionesPendientes(resumen, registrar);
  await enviarAvisosPendientes(ahora, resumen, registrar);

  return resumen;
}
