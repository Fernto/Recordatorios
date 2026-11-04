-- ================================================================
-- MIGRACIÓN — Sistema de Recordatorios
-- Ejecuta en: Supabase > SQL Editor. Es idempotente: puedes repetirla.
-- No borra datos.
-- ================================================================

-- 1) Nuevo estado 'vencido' para recordatorios que no se enviaron a tiempo.
ALTER TABLE public.recordatorios DROP CONSTRAINT IF EXISTS recordatorios_estado_check;
ALTER TABLE public.recordatorios
  ADD CONSTRAINT recordatorios_estado_check
  CHECK (estado IN ('pendiente','enviado','cancelado','vencido'));

-- 2) Índice para la búsqueda de confirmaciones pendientes.
CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes
  ON public.recordatorios (confirmacion_enviada, estado);

-- 3) RLS: la anon key deja de poder borrar filas.
DROP POLICY IF EXISTS "Acceso total anon"            ON public.recordatorios;
DROP POLICY IF EXISTS "anon lee recordatorios"       ON public.recordatorios;
DROP POLICY IF EXISTS "anon crea recordatorios"      ON public.recordatorios;
DROP POLICY IF EXISTS "anon actualiza recordatorios" ON public.recordatorios;

CREATE POLICY "anon lee recordatorios" ON public.recordatorios
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon crea recordatorios" ON public.recordatorios
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon actualiza recordatorios" ON public.recordatorios
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

REVOKE DELETE ON public.recordatorios FROM anon, authenticated;

-- 4) Logs: el cliente web ya no los lee. Solo el servidor inserta.
ALTER TABLE public.logs_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total anon logs" ON public.logs_envios;
DROP POLICY IF EXISTS "servidor inserta logs"  ON public.logs_envios;

CREATE POLICY "servidor inserta logs" ON public.logs_envios
  FOR INSERT TO anon, authenticated WITH CHECK (true);

REVOKE SELECT, UPDATE, DELETE ON public.logs_envios FROM anon, authenticated;
