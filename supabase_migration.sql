-- ================================================================
-- MIGRACIÓN — Sistema de Recordatorios
-- Ejecuta en: Supabase > SQL Editor. Es idempotente: puedes repetirla.
-- No borra datos.
-- ================================================================

-- 0) Tabla de logs: puede faltar aunque recordatorios ya exista.
CREATE TABLE IF NOT EXISTS public.logs_envios (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recordatorio_id   UUID        REFERENCES public.recordatorios(id) ON DELETE CASCADE,
  canal             TEXT        NOT NULL CHECK (canal IN ('email','whatsapp')),
  destinatario      TEXT        NOT NULL,
  estado            TEXT        NOT NULL CHECK (estado IN ('ok','error')),
  error_msg         TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_recordatorio
  ON public.logs_envios (recordatorio_id);

-- 1) Estado 'vencido' para recordatorios que no se enviaron a tiempo.
--    Se localiza el CHECK existente por su definición: si el nombre generado
--    por Postgres no coincide, igualmente se reemplaza.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'recordatorios'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%pendiente%'
  LOOP
    EXECUTE format('ALTER TABLE public.recordatorios DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.recordatorios
  ADD CONSTRAINT recordatorios_estado_check
  CHECK (estado IN ('pendiente','enviado','cancelado','vencido'));

-- 2) Índice para la búsqueda de confirmaciones pendientes.
CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes
  ON public.recordatorios (confirmacion_enviada, estado);

-- 3) RLS: la anon key deja de poder borrar filas.
ALTER TABLE public.recordatorios ENABLE ROW LEVEL SECURITY;

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

-- 5) Que PostgREST vea de inmediato la tabla y el constraint nuevos.
NOTIFY pgrst, 'reload schema';
