// src/supabase.js
// Cliente de Supabase del navegador — usa las variables VITE_*.
// No debe contener credenciales: si faltan, se informa en la interfaz.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(supabaseUrl && supabaseKey);

export const MENSAJE_SIN_CONFIGURAR =
  'Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. ' +
  'Añádelas en tu archivo .env (desarrollo) o en las variables de entorno del sitio.';

function clienteNoConfigurado() {
  const fallar = () => {
    throw new Error(MENSAJE_SIN_CONFIGURAR);
  };
  return { from: fallar, rpc: fallar };
}

if (!supabaseConfigurado) {
  console.error(`⚠️ ${MENSAJE_SIN_CONFIGURAR}`);
}

export const supabase = supabaseConfigurado
  ? createClient(supabaseUrl, supabaseKey)
  : clienteNoConfigurado();
