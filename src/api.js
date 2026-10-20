// src/api.js
import { supabase } from './supabase';

// ─── CREAR RECORDATORIO ─────────────────────────────────────────────────────
/**
 * Inserta un nuevo recordatorio directamente en Supabase.
 * Ya no usamos webhooks (n8n/Make).
 * @param {Object} recordatorio
 * @returns {Promise<Object>}
 */
export async function crearRecordatorio(recordatorio) {
  const { data, error } = await supabase
    .from('recordatorios')
    .insert([{
      ...recordatorio,
      estado: 'pendiente',
      confirmacion_enviada: false
    }])
    .select();

  if (error) throw new Error(`Error al crear en Supabase: ${error.message}`);
  const nuevo = data?.[0];

  // Despacho inmediato del correo de confirmación (funciona en dev y en producción)
  if (nuevo) {
    try {
      await fetch('/api/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevo),
      });
    } catch (errConfirm) {
      console.warn('⚠️ Envío inmediato diferido al cron:', errConfirm);
    }
  }

  return nuevo || { ok: true };
}

// ─── LISTAR RECORDATORIOS ───────────────────────────────────────────────────
/**
 * Obtiene todos los recordatorios directamente desde Supabase.
 * Ordenados por fecha de creación descendente.
 * @returns {Promise<Array>}
 */
export async function listarRecordatorios() {
  try {
    const { data, error } = await supabase
      .from('recordatorios')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('listarRecordatorios: error en Supabase', e.message);
    return [];
  }
}

// ─── CANCELAR / ACTUALIZAR RECORDATORIO ────────────────────────────────────
/**
 * Actualiza el estado de un recordatorio directamente en Supabase.
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
