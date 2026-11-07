# 🤖 Contexto del Proyecto: Sistema de Recordatorios Automatizado (agent.md)

Guía técnica, arquitectura y contexto operativo del proyecto **Recordatorios**. Este documento describe el código **tal como está hoy**; si cambias algo relevante, actualízalo en el mismo commit.

---

## 📌 1. Visión general

Aplicación full-stack para crear, programar y despachar recordatorios por **correo electrónico** y **WhatsApp**.

1. **Frontend SPA (React + Vite)**: formulario, listado, filtros y cancelación. Interfaz oscura de alto contraste con un único acento índigo (sistema de diseño *Ink & Indigo*, ver sección 10). Habla **directamente** con Supabase (no hay API propia de CRUD).
2. **Supabase (PostgreSQL)**: tabla `recordatorios`, tabla `logs_envios` y la vista `v_recordatorios_pendientes`.
3. **Motor de envío**: una sola implementación (`worker.mjs` + `mailer.mjs`) ejecutada desde dos sitios intercambiables:
   - `cron.mjs`, proceso Node continuo (VPS / Render / Railway).
   - `netlify/functions/check-reminders.mjs`, invocado por el scheduler declarado en `netlify.toml` (cada 5 min).

> **Regla de oro:** la lógica de envío vive **una sola vez** en `mailer.mjs` + `worker.mjs`. `cron.mjs` y las funciones de Netlify son adaptadores finos. No dupliques plantillas, ICS ni reglas de recurrencia.

---

## 🏗️ 2. Arquitectura y flujo

```mermaid
flowchart TD
    User([Usuario]) -->|crea / cancela| UI[React SPA :5173]
    UI -->|insert / select / update| DB[(Supabase PostgreSQL)]

    UI -->|POST /api/send-confirmation { id }| EP[Endpoint confirmación]
    EP -->|lee el registro por id| DB
    EP --> M[Mailer: plantillas + .ics]

    subgraph Motor compartido
        W[worker.mjs · procesarCiclo] --> M
        W -->|WhatsApp| WA[CallMeBot]
        W -->|lee/escribe| DB
    end

    CronDaemon[cron.mjs · cada 1 min] --> W
    CronHTTP[cron externo · cada 1 min] --> FN[check-reminders.mjs]
    FN --> W
```

**Puntos de entrada:** SPA (Vite), `cron.mjs`, `send-confirmation.mjs`, `check-reminders.mjs`.
**Núcleo compartido:** `db.mjs`, `mailer.mjs`, `worker.mjs`.

---

## 📂 3. Estructura del repositorio

```
Recordatorios/
├── .env                     # Variables locales (ignorado por git)
├── .env.example             # Plantilla de variables (sin valores reales)
├── agent.md                 # Este documento
├── db.mjs                   # Cliente Supabase del SERVIDOR (service role o anon)
├── mailer.mjs               # SMTP, plantillas HTML, ICS, WhatsApp y confirmación idempotente
├── worker.mjs               # Ciclo completo: recurrencias, vencidos, confirmaciones y avisos
├── cron.mjs                 # Planificador (node-cron) + keep-alive de Supabase
├── netlify.toml             # Build, redirects y bundler esbuild de funciones
├── netlify/functions/
│   ├── check-reminders.mjs  # Adaptador HTTP del ciclo (para cron externo)
│   └── send-confirmation.mjs# Endpoint de confirmación inmediata (solo acepta { id })
├── index.html               # Entrada HTML
├── package.json             # Scripts y dependencias
├── supabase_schema.sql      # Esquema completo para instalaciones nuevas
├── supabase_migration.sql   # Migración idempotente para bases ya existentes
├── vite.config.js           # Vite + middleware de dev para /api/send-confirmation
└── src/
    ├── api.js               # Acceso a Supabase + disparo de la confirmación
    ├── App.jsx              # Vistas, iconos SVG y estados de la interfaz
    ├── index.css            # Sistema de diseño: tokens, componentes, responsive y a11y
    ├── main.jsx             # Entrada de React
    └── supabase.js          # Cliente Supabase del navegador (sin credenciales embebidas)
```

---

## 🗄️ 4. Modelo de datos

### Tabla `recordatorios`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | `gen_random_uuid()` |
| `titulo` | `TEXT` NOT NULL | Asunto |
| `descripcion` | `TEXT` | Detalle opcional |
| `fecha_hora` | `TIMESTAMPTZ` NOT NULL | Fecha y hora del evento |
| `anticipacion` | `INTEGER` default 60 | Minutos de antelación del aviso |
| `recurrencia` | `TEXT` | `ninguna` \| `diario` \| `semanal` \| `mensual` |
| `canal` | `TEXT` | `email` \| `whatsapp` \| `ambos` |
| `destinatario_wa` | `TEXT` | Números con código de país, separados por coma |
| `destinatario_email` | `TEXT` | Correos separados por coma |
| `estado` | `TEXT` | `pendiente` \| `enviado` \| `cancelado` \| `vencido` |
| `confirmacion_enviada` | `BOOLEAN` | Marca de "ya se envió el correo de confirmación" |
| `created_at` | `TIMESTAMPTZ` | `now()` |

### Tabla `logs_envios`

`recordatorio_id` (FK, `ON DELETE CASCADE`), `canal` (`email`/`whatsapp`), `destinatario`, `estado` (`ok`/`error`), `error_msg`, `created_at`. Es la única trazabilidad de los envíos.

### Vista `v_recordatorios_pendientes`

```sql
SELECT ... FROM recordatorios
WHERE estado = 'pendiente'
  AND (fecha_hora - anticipacion::double precision * '00:01:00'::interval) <= now()
  AND fecha_hora > (now() - '01:00:00'::interval)   -- ventana de gracia de 1 hora
```

- Entra cuando `now() >= fecha_hora - anticipacion`.
- La **ventana de gracia de 1 hora** evita avisos zombie tras una caída prolongada. `worker.mjs` usa la misma constante (`VENTANA_GRACIA_MS`) para recuperar lo que quede fuera de la vista.
- `security_invoker = on`: la vista respeta las políticas RLS de quien consulta.

### RLS

- `anon`/`authenticated`: `SELECT`, `INSERT` y `UPDATE` sobre `recordatorios`; **sin `DELETE`** (privilegio revocado además de la política).
- `logs_envios`: solo `INSERT` para `anon`; `SELECT/UPDATE/DELETE` revocados.
- **Limitación conocida:** no hay autenticación. Cualquiera con la URL y la anon key puede **leer** todos los recordatorios (incluidos correos y teléfonos). Si el sitio es o va a ser público, hay que añadir login antes de guardar datos de terceros.

---

## ⚙️ 5. Variables de entorno

```env
# Supabase
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=          # opcional: el servidor ignora RLS con ella

# WhatsApp
CALLMEBOT_API_KEY=

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu_cuenta@gmail.com
SMTP_PASS=<app-password-de-16-caracteres>
EMAIL_FROM_NAME=Recordatorios

# Seguridad de endpoints (opcionales)
CRON_SECRET=                        # exigido por check-reminders si está definido
CONFIRMATION_API_TOKEN=             # permite llamadas servidor-a-servidor al endpoint de confirmación
```

- Solo las `VITE_*` se exponen al navegador. **Nunca** pongas `SMTP_PASS`, `CALLMEBOT_API_KEY` o la service role en una variable `VITE_*`.
- `db.mjs` llama a `dotenv/config`, así que `cron.mjs`, las funciones y el dev server cargan `.env` automáticamente. En Netlify las variables las inyecta la plataforma (no hay `.env`).
- Gmail exige verificación en 2 pasos y una **App Password** de 16 caracteres.
- `.env.example` documenta todas las claves sin valores reales.

---

## 🚀 6. Comandos

| Comando | Acción |
|---|---|
| `npm run dev` | Vite en `http://localhost:5173` (incluye el endpoint de confirmación real) |
| `npm run cron` | Worker continuo: revisa cada minuto y hace keep-alive a medianoche |
| `npm run build` | Compila a `/dist` |
| `npm run preview` | Sirve el build localmente |

No hay tests, linter ni typecheck configurados. La verificación habitual es `npm run build` y una prueba manual del flujo.

> **El aviso no lo envía el navegador.** Al crear un recordatorio solo se dispara la **confirmación** (vía `/api/send-confirmation`). El correo de aviso lo manda un ciclo del worker, así que sin `npm run cron` en local (o el cron de Netlify en producción) llega el primer correo y **nunca** el segundo. Síntoma típico: "la confirmación llega, el aviso no".

---

## 🧩 7. Módulos compartidos del servidor

### `db.mjs`
Cliente Supabase del servidor. Usa `SUPABASE_SERVICE_ROLE_KEY` si existe y, si no, la anon key. Falla con mensaje claro si faltan URL o clave. Exporta `supabase` y `usaServiceRole`.

### `mailer.mjs`
Única fuente de verdad de la comunicación saliente:

| Export | Función |
|---|---|
| `parsearDestinatarios(str)` | `"a@x.com, b@y.com"` → array |
| `escaparHtml` / `escaparIcs` | Escape de HTML y de RFC 5545 |
| `textoAnticipacion(min)` | Texto legible de la anticipación |
| `generarLinksCalendario(rec)` | URLs de Google Calendar y Outlook Web |
| `generarIcs(rec)` | `.ics` válido con `RRULE`, `ORGANIZER` y plegado de líneas |
| `generarHtmlEmailAviso` / `generarHtmlEmailConfirmacion` | Plantillas de los dos correos |
| `guardarLog(...)` | Inserta en `logs_envios` (nunca lanza) |
| `enviarConfirmacion(rec)` | Confirmación **idempotente** (ver abajo) |
| `enviarAviso(rec)` | Aviso por WhatsApp y/o email; devuelve qué canal funcionó |

### `worker.mjs`
| Export | Función |
|---|---|
| `siguienteOcurrencia(fecha, recurrencia)` | Suma un periodo respetando fin de mes |
| `proximaFechaFutura(fecha, recurrencia, desde)` | Avanza hasta la primera ocurrencia futura (máx. 500 saltos) |
| `procesarCiclo({ ahora, log })` | Ejecuta las cuatro fases y devuelve un resumen |
| `VENTANA_GRACIA_MS` | 1 hora, alineada con la vista SQL |

---

## 🔄 8. Reglas de negocio

`procesarCiclo` ejecuta **en este orden**:

1. **Recuperar recurrencias perdidas** — `estado='pendiente'`, `recurrencia != 'ninguna'`, `fecha_hora < now() - 1h`. Se reprograman a la **primera ocurrencia futura**, sin enviar el aviso tardío. Esto evita que una caída del worker mate una recurrencia para siempre.
2. **Vencer recordatorios atrasados** — no recurrentes, `pendiente` y con más de 1 hora de retraso pasan a `vencido`. Si la base no acepta ese estado (migración sin aplicar), el worker lo desactiva y avisa **una vez** en el log; no rompe nada.
3. **Confirmaciones pendientes** — `confirmacion_enviada = false` y `estado = 'pendiente'`.
4. **Avisos** — los que devuelve `v_recordatorios_pendientes`.

### Confirmación exactamente una vez

`mailer.enviarConfirmacion` hace un *claim* atómico:

```js
UPDATE recordatorios SET confirmacion_enviada = true
WHERE id = :id AND confirmacion_enviada = false AND estado = 'pendiente'
```

- Si el `UPDATE` no afecta filas, otro proceso ya la envió → se salta (sin duplicados, incluso con cron y Netlify activos a la vez).
- Si el envío SMTP falla, la marca **se libera** (`false`) y el worker reintenta en el siguiente minuto.
- Canales sin email (`whatsapp`) solo dejan la marca en `true`.
- Las ocurrencias siguientes de una recurrencia **no** reenvían confirmación: al reprogramar se conserva `confirmacion_enviada = true`.

### Avisos y recurrencias

- El aviso se envía y **luego** se actualiza el estado, aunque un canal falle: se prioriza no reenviar el mismo aviso en bucle. Los fallos quedan en `logs_envios` (y en la respuesta del ciclo), no se reintentan.
- Recurrente → `fecha_hora = primera ocurrencia futura`, sigue `pendiente`.
- No recurrente → `estado = 'enviado'`.

### Zona horaria

`fecha_hora` es `TIMESTAMPTZ` y se guarda en UTC (`new Date(...).toISOString()` desde el `datetime-local` del navegador). Las plantillas y el ICS formatean con `es-MX`. Comparaciones siempre en UTC.

---

## 🌐 9. Endpoints

### `POST /api/send-confirmation`

Dev: middleware de `vite.config.js` → **el mismo handler** de Netlify. Prod: redirect de `netlify.toml` a `/.netlify/functions/send-confirmation`.

```json
// request
{ "id": "uuid-del-recordatorio" }

// 200
{ "ok": true, "saltado": false, "messageId": "<...>" }
```

- El **contenido del correo nunca viene del cliente**: se lee de Supabase por `id`. Esto cierra el antiguo relay abierto.
- `405` método distinto de POST · `400` id ausente o inválido · `403` origen cruzado sin token · `404` id inexistente · `502` fallo de envío (el worker reintenta).
- Autorización: mismo `Origin`/`Host`, o `Authorization: Bearer $CONFIRMATION_API_TOKEN`.

### `GET|POST /.netlify/functions/check-reminders`

Ejecuta un ciclo completo. Si `CRON_SECRET` está definido, exige `Authorization: Bearer $CRON_SECRET`. Devuelve conteos y detalle. Hoy lo dispara el scheduler declarado en `netlify.toml` (cada 5 min). **No definas `CRON_SECRET` con el scheduler de Netlify**: no manda `Authorization` y la función devolvería `401`, dejando los avisos sin enviar.

> Al declararla como *scheduled*, Netlify ya no la expone por URL. Si prefieres cron externo (cron-job.org / EasyCron), **quita** el bloque `[functions."check-reminders"]` de `netlify.toml` y vuelve a ser una función HTTP normal.

---

## 🎨 10. Interfaz y sistema de diseño

Estética **"Ink & Indigo"**: neutro oscuro casi negro, superficies escalonadas y un único acento índigo. Sin degradados morados ni glassmorphism pesado; el `blur` de fondo se limita al header por rendimiento.

### Paleta (`:root` de `src/index.css`)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0b0c0f` | Fondo de la página |
| `--surface` / `--surface-2` / `--surface-3` | `#101218` / `#161a22` / `#1d222c` | Tarjeta / items e inputs / hover y foco |
| `--line` / `--line-strong` | `rgba(255,255,255,.075)` / `.15` | Bordes base y de énfasis |
| `--text` / `--text-dim` / `--text-faint` | `#e9ebf0` / `#99a1b0` / `#6b7280` | Jerarquía tipográfica |
| `--accent` / `--accent-2` | `#8aa4ff` / `#5b7cfa` | CTA, foco y filtro activo |
| `--amber` / `--mint` / `--rose` / `--slate` | `#fbbf24` / `#34d399` / `#fb7185` / `#94a3b8` | Pendiente / Enviado / Cancelado / Vencido |

### Reglas

- **Todo color sale de un token.** No se escriben hex sueltos en `App.jsx`: los estados se resuelven con clases (`.badge--pendiente`, `.badge--enviado`, …) o con `var(--token)`.
- **Tipografía**: Inter; títulos con tracking `-0.01em`; etiquetas `12.5px/600`; micro-títulos de sección en `10.5px` mayúsculas con `letter-spacing .1em` y una línea degradada a la derecha. Números tabulares (`font-variant-numeric`) en fechas y contadores.
- **Iconografía**: SVG de trazo 24×24 dentro del componente `Icono` (`TRAZOS` en `App.jsx`). Sin librería externa y sin emoji como icono funcional. Para añadir uno: agrega el path a `TRAZOS` y úsalo con `name`.
- **Componentes** (todos definidos en `index.css`): `.card` / `.card-head`, `.section-title`, `.field` + `.input` / `.select`, `.segmented` (canal), `.btn-primary`, `.btn-ghost`, `.btn-cancel`, `.badge` / `.badge-canal`, `.chip` (filtros), `.rec-item`, `.alert`, `.empty`, `.skeleton`.
- **Profundidad**: radios 9 / 12 / 16 / 20 px según nivel y sombras en dos capas (contacto + elevación difusa). Nada de sombras de color saturado.
- **Estados interactivos**: el hover sube el borde a `--line-strong`; el foco usa `:focus-visible` (outline índigo de 2 px) además del anillo interior de los inputs.
- **Responsive**: una columna por debajo de 900 px; en móvil (≤600 px) el segmentado del canal pasa a vertical, los inputs suben a `16px` para evitar el zoom de iOS y el subtítulo del header se oculta.
- **Accesibilidad**: `aria-pressed` en el canal, `role="tab"` + `aria-selected` en los filtros, `role="status"` / `role="alert"` en los mensajes, `aria-label` en botones de solo icono y respeto a `prefers-reduced-motion`.
- **Rendimiento**: solo el header usa `backdrop-filter`; el resto de superficies son sólidas para no encadenar blur.

Si cambias la paleta, hazlo **solo** en `:root`: badges, alertas y el riel de estado de la lista heredan de ahí. El riel izquierdo de cada recordatorio se deriva de `estado` en `App.jsx`, así que un estado nuevo necesita token, clase `.badge--<estado>` y entrada en `ESTADO_CONFIG`.

---

## 🌍 11. Despliegue

**Netlify**
- Sitio: <https://recordatorios-fernto.netlify.app> · proyecto `7a66495e-13fb-40f1-81cc-8f1060483b2e` · equipo *ferntomas1's team*. Se linkea con `npx netlify-cli link`, que escribe `.netlify/` (ignorado por git).
- `netlify.toml`: `command = "npm run build"`, `publish = "dist"`, `functions = "netlify/functions"`, `node_bundler = "esbuild"`.
- `esbuild` es necesario para que las funciones empaqueten `db.mjs`, `mailer.mjs` y `worker.mjs`, que están **fuera** de la carpeta de funciones (imports relativos `../../`).
- Variables: todas las de la sección 5 (sin `.env`). Hoy están cargadas en el sitio con `npx netlify-cli env:import .env`. **No definas `CRON_SECRET`** (ver sección 9). Las `VITE_*` se incrustan en el build: si cambian, hay que redesplegar.
- Redesplegar: `npx netlify-cli deploy --build --prod`. Un deploy de *preview* **no** activa el schedule.
- `check-reminders` está declarada como *scheduled* cada 5 min. Netlify solo la ejecuta en deploys publicados y ya no la expone por URL (un GET directo devuelve `403`, no es un fallo).
- Verificación: `npx netlify-cli logs --source functions --function check-reminders --since 10m`. Debe aparecer una invocación cada 5 min con `Duration` y, si falta la migración, el aviso del estado `vencido`. Si `CRON_SECRET` estuviera definido, cada ejecución respondería `401` sin escribir nada en el log de la función: el síntoma es "no llegan avisos" sin errores visibles.
- **Avisos**: `netlify.toml` declara `[functions."check-reminders"] schedule = "*/5 * * * *"`. Netlify solo lo ejecuta en **deploys publicados** (no en `netlify dev`), así que el ciclo corre como máximo cada 5 minutos.
- Alternativa: cron externo → `/.netlify/functions/check-reminders` cada minuto, **después de quitar** el bloque `[functions."check-reminders"]` (una función programada no acepta invocación por URL). Si lo use así, define `CRON_SECRET` y manda el `Bearer`.
- ⚠️ Con el scheduler nativo, `CRON_SECRET` debe quedar **vacío** (Netlify no envía `Authorization`).
- Límite de 30 s por invocación: con muchos recordatorios a la vez el ciclo podría quedar corto; en ese caso baja la frecuencia o usa el worker 24/7 (`npm run cron`).
- Con anticipaciones cortas (15 min) el aviso puede llegar hasta 5 minutos tarde: la vista SQL exige que la ventana esté abierta, no puntualidad exacta.

**Base de datos**
- Instalación nueva: `supabase_schema.sql`.
- Base existente: `supabase_migration.sql` (idempotente, no borra datos). Habilita `vencido` y cierra el `DELETE` anónimo.

**Worker 24/7 alternativo**
`npm run cron` en Render/Railway/VPS. No ejecutes el worker y el cron HTTP a la vez salvo que quieras redundancia: está protegido contra duplicados, pero multiplica el tráfico.

---

## 🔐 12. Seguridad — estado y pendientes

**Hecho**
- Sin credenciales en el código: la App Password de Gmail y la anon key hardcodeadas se eliminaron; ahora todo viene del entorno (`.env` / variables del sitio).
- Endpoint de confirmación cerrado: solo acepta `{ id }`, valida UUID, exige mismo origen o token, y es idempotente.
- HTML de los correos escapado (título y descripción) y `.ics` escapado según RFC 5545.
- RLS sin `DELETE` para `anon`, logs privados, respuesta de errores sin `stack`.

**Pendiente / requiere acción del dueño**
1. **Rotar la App Password de Gmail**: la anterior quedó en el historial de git (commit `447bad3`). Quitarla del archivo no basta: hay que revocarla en Google y crear otra.
2. **Añadir autenticación** si el sitio es público: hoy cualquier visitante lee todos los recordatorios.
3. Definir `CRON_SECRET` y `CONFIRMATION_API_TOKEN` en producción.

---

## 💡 13. Notas para futuros agentes

1. **No dupliques** envío, plantillas ni recurrencias: extiende `mailer.mjs` / `worker.mjs`.
2. **No metas credenciales** en el código ni en `src/`. Usa `.env` (local) o variables del sitio.
3. El frontend escribe **directo** en Supabase; si añades validación de negocio, hazla también en el servidor.
4. Toda llamada al endpoint debe mandar **solo el `id`**; el servidor decide destinatarios y contenido.
5. Al tocar el `.ics`: `RRULE` va en su propia línea y el evento se manda con `icalEvent` (no como adjunto duplicado).
6. Al tocar la vista SQL, mantén la ventana de 1 hora alineada con `VENTANA_GRACIA_MS`.
7. Si añades un estado a `estado`, actualiza el `CHECK`, `ESTADO_CONFIG` en `App.jsx`, la clase `.badge--<estado>` en `index.css` y `FILTROS`.
8. Antes de tocar la estética, revisa la sección 10: la paleta vive en `:root` y los componentes ya existen. Evita volver a estilos inline con colores literales.
9. Los iconos son SVG propios (`TRAZOS`). No introduzcas una librería de iconos ni emoji nuevos para acciones.
10. Si un aviso "no llega", comprueba **primero** que exista un ciclo ejecutándose (`npm run cron` o el schedule de Netlify) antes de tocar `mailer.mjs`: el envío está probado de extremo a extremo (correo real, `estado → enviado`) y el fallo habitual es que nadie arranca el worker.
