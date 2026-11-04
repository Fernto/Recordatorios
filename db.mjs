import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// ── Cliente Supabase del SERVIDOR (worker, funciones Netlify, dev middleware) ──
// Nunca llega al navegador: este archivo no se importa desde src/.
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

// Preferimos la service role key (ignora RLS). Si no existe, usamos la anon key,
// que hoy funciona porque el esquema permite lectura/escritura anónima.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (o SUPABASE_SERVICE_ROLE_KEY) ' +
      'en el entorno del servidor. Revisa tu archivo .env o las variables del sitio.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  // Node no trae WebSocket global hasta la v22; supabase-js lo necesita para
  // construir el cliente de realtime aunque no lo usemos.
  realtime: { transport: WebSocket },
});

export const usaServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
