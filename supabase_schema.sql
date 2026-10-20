-- ================================================================
-- SISTEMA DE RECORDATORIOS — Supabase SQL
-- Ejecuta este script en: Supabase > SQL Editor > New Query
-- ================================================================

-- 1. Crear tabla principal
CREATE TABLE IF NOT EXISTS recordatorios (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo                TEXT        NOT NULL,
  descripcion           TEXT,
  fecha_hora            TIMESTAMPTZ NOT NULL,
  anticipacion          INTEGER     DEFAULT 60,    -- minutos antes del evento
  recurrencia           TEXT        DEFAULT 'ninguna'
                        CHECK (recurrencia IN ('ninguna','diario','semanal','mensual')),
  canal                 TEXT        DEFAULT 'ambos'
                        CHECK (canal IN ('whatsapp','email','ambos')),
  destinatario_wa       TEXT,                      -- número WhatsApp con código país
  destinatario_email    TEXT,                      -- correo del destinatario
  estado                TEXT        DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','enviado','cancelado')),
  confirmacion_enviada  BOOLEAN     DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- 2. Índices para que Make.com consulte rápido
CREATE INDEX IF NOT EXISTS idx_recordatorios_estado
  ON recordatorios (estado);

CREATE INDEX IF NOT EXISTS idx_recordatorios_fecha
  ON recordatorios (fecha_hora);

-- 3. Habilitar Row Level Security (RLS) — para producción
ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;

-- Política permisiva (ajusta según tu auth de Supabase)
-- Si no usas auth de Supabase, usa esta política abierta:
CREATE POLICY "Acceso total anon" ON recordatorios
  FOR ALL USING (true) WITH CHECK (true);

-- ── VISTA ÚTIL ──────────────────────────────────────────────────────────────
-- Make.com puede hacer SELECT * FROM v_recordatorios_pendientes
-- para encontrar qué recordatorios hay que enviar ahora mismo.

-- Vista con security_invoker=on: corre con permisos del CALLER, no del owner.
-- Más seguro: RLS se aplica correctamente al usuario que consulta.
CREATE OR REPLACE VIEW public.v_recordatorios_pendientes
  WITH (security_invoker = on) AS
SELECT
  id, titulo, descripcion, fecha_hora, anticipacion,
  recurrencia, canal, destinatario_wa, destinatario_email,
  estado, confirmacion_enviada, created_at
FROM recordatorios
WHERE
  estado = 'pendiente'
  AND (fecha_hora - anticipacion::double precision * '00:01:00'::interval) <= now()
  AND fecha_hora > (now() - '01:00:00'::interval);

-- ── TABLA DE LOGS DE ENVÍOS ──────────────────────────────────────────────────
-- Registra cada intento de envío (email o WhatsApp) con su resultado.
CREATE TABLE IF NOT EXISTS logs_envios (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recordatorio_id   UUID        REFERENCES recordatorios(id) ON DELETE CASCADE,
  canal             TEXT        NOT NULL CHECK (canal IN ('email','whatsapp')),
  destinatario      TEXT        NOT NULL,   -- correo o número de teléfono
  estado            TEXT        NOT NULL CHECK (estado IN ('ok','error')),
  error_msg         TEXT,                   -- mensaje de error si falló
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Índice para consultar el historial por recordatorio
CREATE INDEX IF NOT EXISTS idx_logs_recordatorio
  ON logs_envios (recordatorio_id);

-- RLS para logs
ALTER TABLE logs_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso total anon logs" ON logs_envios
  FOR ALL USING (true) WITH CHECK (true);

-- ── DATOS DE PRUEBA (opcional) ───────────────────────────────────────────────
-- INSERT INTO recordatorios (titulo, fecha_hora, canal, destinatario_wa, destinatario_email)
-- VALUES (
--   'Prueba de recordatorio',
--   NOW() + INTERVAL '2 minutes',   -- cambia a 2 minutos para probar rápido
--   'ambos',
--   '5212229137794',                -- tu número activado con CallMeBot
--   'tu@correo.com, otro@correo.com' -- puedes poner varios separados por coma
-- );
