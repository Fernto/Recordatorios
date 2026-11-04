import 'dotenv/config';
import cron from 'node-cron';
import { supabase } from './db.mjs';
import { procesarCiclo } from './worker.mjs';

// ── Keep-alive: ping diario para evitar que Supabase pause el proyecto ───────
async function keepAlive() {
  try {
    const { error } = await supabase
      .from('recordatorios')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    console.log('💓 [Keep-alive] Ping a Supabase exitoso — proyecto activo.');
  } catch (e) {
    console.warn('⚠️  [Keep-alive] Ping falló:', e.message);
  }
}

let cicloEnCurso = false;

async function ejecutarCiclo() {
  if (cicloEnCurso) {
    console.warn('⏭️  El ciclo anterior aún no termina; se omite esta vuelta.');
    return;
  }

  cicloEnCurso = true;
  const ahora = new Date().toLocaleString('es-MX');
  console.log(`\n[${ahora}] 🔍 Ciclo de recordatorios...`);

  try {
    const resumen = await procesarCiclo({ log: (m) => console.log(m) });
    const { recuperados, vencidos, confirmaciones, avisos } = resumen;

    if (confirmaciones.length === 0 && avisos.length === 0 && recuperados.length === 0 && vencidos.length === 0) {
      console.log('💤 Nada por hacer en este ciclo.');
    } else {
      console.log(
        `📊 Resumen: ${confirmaciones.length} confirmación(es), ${avisos.length} aviso(s), ` +
          `${recuperados.length} recurrencia(s) recuperada(s), ${vencidos.length} vencido(s).`
      );
    }
  } catch (e) {
    console.error('❌ Error en el ciclo:', e.message);
  } finally {
    cicloEnCurso = false;
  }
}

console.log('🚀 Iniciando Motor de Recordatorios (worker)...');
console.log('   → 1. Recurrencias atrasadas: se reprograman a la próxima ocurrencia');
console.log('   → 2. Recordatorios sin enviar y atrasados: pasan a "vencido"');
console.log('   → 3. Confirmaciones al agendar: exactamente una vez');
console.log('   → 4. Avisos: según la anticipación configurada');
console.log('   → Email: nodemailer SMTP con invitación de calendario');
console.log('   → WhatsApp: CallMeBot (multi-número)');
console.log('   → Revisión: cada 1 minuto\n');

cron.schedule('0 0 * * *', keepAlive);
cron.schedule('* * * * *', ejecutarCiclo);
