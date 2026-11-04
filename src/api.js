// src/api.js
import { supabase } from './supabase';

// ─── CREAR RECORDATORIO ─────────────────────────────────────────────────────
/**
 * Inserta un nuevo recordatorio en Supabase y pide el correo de confirmación.
 * El endpoint recibe solo el id: el contenido se lee de la base de datos.
 * @param {Object} recordatorio
 * @returns {Promise<Object>}
 */
export async function crearRecordatorio(recordatorio) {
  const { data, error } = await supabase
    .from('recordatorios')
    .insert([{
      ...recordatorio,
      estado: 'pendiente',
      confirmacion_enviada: false,
    }])
    .select();

  if (error) throw new Error(`Error al crear en Supabase: ${error.message}`);
  const nuevo = data?.[0];

  // Despacho inmediato de la confirmación. Si falla, el worker la envía en su
  // siguiente ciclo (la marca sigue en false), así que no se pierde.
  if (nuevo?.id) {
    try {
      const resp = await fetch('/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: nuevo.id }),
      });
      if (!resp.ok) {
        console.warn(`⚠️ Confirmación diferida al worker (HTTP ${resp.status}).`);
      }
    } catch (err) {
      console.warn('⚠️ Confirmación diferida al worker:', err.message);
    }
  }

  return nuevo || { ok: true };
}

// ─── LISTAR RECORDATORIOS ───────────────────────────────────────────────────
/**
 * Obtiene todos los recordatorios desde Supabase, del más reciente al más viejo.
 * Lanza si hay error: la interfaz debe poder avisar en vez de mostrar una lista vacía.
 * @returns {Promise<Array>}
 */
export async function listarRecordatorios() {
  const { data, error } = await supabase
    .from('recordatorios')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`No se pudieron cargar los recordatorios: ${error.message}`);
  return data || [];
}

// ─── CANCELAR / ACTUALIZAR RECORDATORIO ────────────────────────────────────
/**
 * Actualiza el estado de un recordatorio en Supabase.
 * @param {string} id - UUID del recordatorio
 * @param {Object} cambios - ej: { estado: 'cancelado' }
 * @returns {Promise<Object>}
 */
export async function actualizarRecordatorio(id, cambios) {
  const { data, error } = await supabase
    .from('recordatorios')
    .update(cambios)
    .eq('id', id)
    .select();

  if (error) throw new Error(`Error al actualizar en Supabase: ${error.message}`);
  return data?.[0] || { ok: true };
}
