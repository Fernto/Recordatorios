// src/supabase.js
// Cliente de Supabase — usa las variables de entorno VITE_*
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '⚠️ Falta configurar las variables de entorno en Netlify:\n' +
    '1. Ve a Netlify > Site configuration > Environment variables\n' +
    '2. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY\n' +
    '3. Ve a Deploys > Trigger deploy > Clear cache and deploy site'
  );
}

// Fallback temporal para evitar pantalla blanca antes de que el usuario configure las variables
export const supabase = createClient(
  supabaseUrl || 'https://uhyrhqvrocbupgfnbjxu.supabase.co',
  supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoeXJocXZyb2NidXBnZm5ianh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NjI2MDQsImV4cCI6MjEwNjUzODYwNH0.5JCg5NZMA0qDpq3AmynIc6RjGiZrJudJRbfY0GhPnRo'
);

