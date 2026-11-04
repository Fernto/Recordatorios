-- ================================================================
-- SISTEMA DE RECORDATORIOS — Supabase SQL (instalación nueva)
-- Ejecuta este script en: Supabase > SQL Editor > New Query
-- Si ya tienes la base creada, usa supabase_migration.sql
-- ================================================================

-- ── 1. Tabla principal ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recordatorios (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo                TEXT        NOT NULL,
  descripcion           TEXT,
  fecha_hora            TIMESTAMPTZ NOT NULL,
  anticipacion          INTEGER     DEFAULT 60,    -- minutos antes del evento
  recurrencia           TEXT        DEFAULT 'ninguna'
                        CHECK (recurrencia IN ('ninguna','diario','semanal','mensual')),
  canal                 TEXT        DEFAULT 'ambos'
                        CHECK (canal IN ('whatsapp','email','ambos')),
  destinatario_wa       TEXT,                      -- números separados por coma
  destinatario_email    TEXT,                      -- correos separados por coma
  estado                TEXT        DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','enviado','cancelado','vencido')),
  confirmacion_enviada  BOOLEAN     DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Índices ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recordatorios_estado ON public.recordatorios (estado);
CREATE INDEX IF NOT EXISTS idx_recordatorios_fecha  ON public.recordatorios (fecha_hora);
CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes
  ON public.recordatorios (confirmacion_enviada, estado);

-- ── 3. Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.recordatorios ENABLE ROW LEVEL SECURITY;

-- El cliente web (anon) puede leer, crear y actualizar, pero NO borrar.
DROP POLICY IF EXISTS "Acceso total anon"                     ON public.recordatorios;
DROP POLICY IF EXISTS "anon lee recordatorios"                ON public.recordatorios;
DROP POLICY IF EXISTS "anon crea recordatorios"               ON public.recordatorios;
DROP POLICY IF EXISTS "anon actualiza recordatorios"          ON public.recordatorios;

CREATE POLICY "anon lee recordatorios" ON public.recordatorios
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "anon crea recordatorios" ON public.recordatorios
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon actualiza recordatorios" ON public.recordatorios
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

REVOKE DELETE ON public.recordatorios FROM anon, authenticated;

-- ⚠️ Sin autenticación, cualquier visitante con la anon key puede LEER todos los
-- recordatorios (incluidos correos y teléfonos). Si el sitio es público, añade
-- login antes de guardar datos de terceros.

-- ── 4. Vista de pendientes por enviar ───────────────────────────────────────
-- security_invoker=on: la vista se evalúa con los permisos del llamante, así que
-- las políticas RLS de arriba se aplican de verdad.
CREATE OR REPLACE VIEW public.v_recordatorios_pendientes
  WITH (security_invoker = on) AS
SELECT
  id, titulo, descripcion, fecha_hora, anticipacion,
  recurrencia, canal, destinatario_wa, destinatario_email,
  estado, confirmacion_enviada, created_at
FROM public.recordatorios
WHERE
  estado = 'pendiente'
  -- Momento de aviso: fecha del evento menos la anticipación
  AND (fecha_hora - anticipacion::double precision * '00:01:00'::interval) <= now()
  -- Ventana de gracia: descarta eventos con más de 1 hora de antigüedad
  AND fecha_hora > (now() - '01:00:00'::interval);

-- ── 5. Logs de envíos ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.logs_envios (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recordatorio_id   UUID        REFERENCES public.recordatorios(id) ON DELETE CASCADE,
  canal             TEXT        NOT NULL CHECK (canal IN ('email','whatsapp')),
  destinatario      TEXT        NOT NULL,
  estado            TEXT        NOT NULL CHECK (estado IN ('ok','error')),
  error_msg         TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_recordatorio ON public.logs_envios (recordatorio_id);

ALTER TABLE public.logs_envios ENABLE ROW LEVEL SECURITY;

-- El servidor (cron / funciones) solo inserta logs; el cliente web no los usa.
DROP POLICY IF EXISTS "Acceso total anon logs" ON public.logs_envios;
DROP POLICY IF EXISTS "servidor inserta logs"  ON public.logs_envios;

CREATE POLICY "servidor inserta logs" ON public.logs_envios
  FOR INSERT TO anon, authenticated WITH CHECK (true);

REVOKE SELECT, UPDATE, DELETE ON public.logs_envios FROM anon, authenticated;

-- ── 6. Datos de prueba (opcional) ───────────────────────────────────────────
-- INSERT INTO public.recordatorios (titulo, fecha_hora, canal, destinatario_email)
-- VALUES ('Prueba', NOW() + INTERVAL '2 minutes', 'email', 'tu@correo.com');
