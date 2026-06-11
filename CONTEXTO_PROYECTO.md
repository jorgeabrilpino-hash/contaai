# CONTEXTO COMPLETO — ContaAI
## Documento maestro para transferencia de contexto entre sesiones
**Generado:** 5 junio 2026 | **Fuente:** Auditoría QA en vivo + análisis estático del codebase

---

## ═══════════════════════════════════════
## PARTE 1 — QUÉ ES EL PROYECTO
## ═══════════════════════════════════════

### 1.1 Descripción

ContaAI es una plataforma web SaaS de contabilidad automatizada para **contadores independientes y MYPEs (Micro y Pequeñas Empresas) en Perú**. Resuelve el problema concreto de la clasificación manual de facturas y boletas de compra, que en Perú requiere:

- Conocer el **PCGE** (Plan Contable General Empresarial) — sistema de cuentas contables peruano estándar
- Identificar si el gasto es **deducible** para Impuesto a la Renta según el régimen tributario
- Calcular el **IGV** (Impuesto General a las Ventas, 18%) y la base imponible
- Registrar todo por **período mensual** para la declaración a **SUNAT** (autoridad tributaria del Perú)

El sistema usa **Gemma 4** (vía OpenRouter) como motor de visión e inteligencia para:
1. **OCR de comprobantes**: extrae datos estructurados de imágenes de facturas/boletas
2. **Clasificación PCGE**: asigna la cuenta contable correcta según el rubro y régimen de la empresa
3. **Routing de intents del bot**: interpreta mensajes de Telegram en lenguaje natural

### 1.2 Contexto del concurso

El proyecto fue construido para el **Gemma 4 Challenge** de DEV.to / Major League Hacking.
- **Categoría:** Build With Gemma 4 ($500 USD)
- **Deadline original:** 24 mayo 2026, 11:59 PM PDT
- **Requisito crítico:** Gemma 4 debe ser el núcleo, no un accesorio
- **Entregable:** Post en DEV.to con demo funcional
- **URL del proyecto en producción:** https://contaai-mu.vercel.app

**Criterios de evaluación del concurso:**
1. Uso intencional y efectivo de Gemma 4
2. Implementación técnica y calidad del código
3. Creatividad y originalidad
4. Usabilidad y experiencia de usuario

### 1.3 Usuarios objetivo

- **Contador independiente:** gestiona múltiples empresas cliente, clasifica facturas mensualmente
- **MYPE peruana:** pequeño negocio que necesita llevar su contabilidad de compras
- **Cliente externo del contador:** envía facturas vía Telegram sin tener acceso al dashboard

---

## ═══════════════════════════════════════
## PARTE 2 — STACK TECNOLÓGICO Y ARQUITECTURA
## ═══════════════════════════════════════

### 2.1 Stack completo (real, post-análisis)

```
Frontend:    Next.js 16.2.6 (App Router) + TypeScript strict
             ⚠️ NOTA: package.json dice 16.2.6, no 14.x como indica CLAUDE.md
UI:          shadcn/ui (radix-ui ^1.4.3) + Tailwind CSS v4
             sonner (toasts, instalado pero NO usado aún)
             lucide-react, date-fns, class-variance-authority
Base datos:  Supabase PostgreSQL + RLS + Storage + Auth
             @supabase/ssr ^0.10.3 + @supabase/supabase-js ^2.106.1
IA:          OpenRouter → google/gemma-4-31b-it:free (principal)
             Fallback automático en 429: llama-4-scout:free, llama-4-maverick:free
Bot:         Telegram Bot API (webhooks, NO polling) ✅
Deploy:      Vercel (frontend + API routes serverless)
             vercel.json: maxDuration 60s para process y export, 30s para webhook
Excel:       xlsx ^0.18.5 (SheetJS)
Runtime:     Node.js >=18, React 19.2.4
```

### 2.2 Modelo de datos (base de datos)

```sql
-- profiles: extiende auth.users de Supabase
id            UUID PK → auth.users.id
nombre        TEXT
telegram_id   BIGINT UNIQUE NULL
telegram_token TEXT NULL  -- token de 6 chars para vinculación
created_at    TIMESTAMPTZ

-- empresas: empresas que gestiona el contador
id            UUID PK
user_id       UUID FK → profiles.id
nombre        TEXT NOT NULL
ruc           VARCHAR(11)  -- puede ser null
rubro         TEXT NOT NULL  -- 'ferretería', 'restaurant', etc.
regimen       TEXT DEFAULT 'RMT'  -- RMT | RER | RG | NRUS
tipo_contrato TEXT DEFAULT 'emese'  -- 'emese' | 'fijo'
created_at    TIMESTAMPTZ

-- documentos: comprobantes de pago procesados
id              UUID PK
empresa_id      UUID FK → empresas.id  [RLS aplicado]
tipo            TEXT  -- 'factura' | 'boleta'
storage_path    TEXT  -- path en Supabase Storage bucket 'documentos'
ruc_emisor      VARCHAR(11)
razon_social    TEXT
fecha_emision   DATE
monto_base      DECIMAL(12,2)
igv             DECIMAL(12,2)
total           DECIMAL(12,2)
cuenta_pcge     VARCHAR(10)  -- '60.1', '63.5', etc.
nombre_cuenta   TEXT
descripcion_ia  TEXT  -- output del OCR de Gemma 4
es_deducible    BOOLEAN
confianza_ia    FLOAT  -- 0.0 a 1.0
estado          TEXT DEFAULT 'pendiente'  -- pendiente|revisado|confirmado
periodo         VARCHAR(7)  -- '2025-05'
created_at      TIMESTAMPTZ

-- upload_tokens: tokens para subida pública (expiran en 15 min)
token       UUID PK
empresa_id  UUID FK → empresas.id
user_id     UUID FK → profiles.id
expires_at  TIMESTAMPTZ NOT NULL
usado       BOOLEAN DEFAULT FALSE
created_at  TIMESTAMPTZ
```

### 2.3 RLS (Row Level Security) en Supabase

```sql
-- El contador solo ve sus propias empresas
CREATE POLICY "user_own_empresas" ON empresas
  FOR ALL USING (user_id = auth.uid());

-- El contador solo ve documentos de SUS empresas
CREATE POLICY "user_own_documentos" ON documentos
  FOR ALL USING (
    empresa_id IN (SELECT id FROM empresas WHERE user_id = auth.uid())
  );
```

### 2.4 Arquitectura de seguridad (3 capas)

```
CAPA 1: Supabase Auth (JWT)
  → Valida identidad en cada request de API
CAPA 2: Validación en API Route
  → empresa_id pertenece al user autenticado
  → upload_token no está usado ni expirado
CAPA 3: Row Level Security (Supabase)
  → Filtro final — aunque escape la capa 2, RLS bloquea
```

### 2.5 Estructura de archivos (completa)

```
contaai/
├── CLAUDE.md                        # Config del agente Claude
├── AGENTS.md                        # "This is NOT the Next.js you know"
├── architecture.md                  # Spec técnica
├── vercel.json                      # Timeouts serverless
├── next.config.ts                   # remotePatterns Supabase
├── package.json
├── tsconfig.json                    # strict mode, paths @/*
├── prompts/                         # Prompts de desarrollo por módulo
│   ├── 00-master.md
│   ├── 01-setup-nextjs.md
│   ├── 02-auth.md
│   ├── 03-dashboard-layout.md
│   ├── 04-empresas.md
│   ├── 05-documents-upload.md
│   ├── 06-gemma4-processing.md
│   ├── 07-telegram-bot.md
│   ├── 08-reports.md
│   └── 09-export-excel.md
├── skills/                          # Patrones de código reutilizables
│   ├── gemma4.md
│   ├── supabase.md
│   ├── security.md
│   ├── components.md
│   └── telegram.md
└── src/
    ├── proxy.ts                     # ⚠️ Middleware SIN ACTIVAR (nombre incorrecto)
    ├── hooks/
    │   └── use-empresa-activa.ts    # Hook para localStorage + CustomEvent
    ├── types/
    │   └── index.ts                 # Tipos dominio: Profile, Empresa, Documento, etc.
    ├── lib/
    │   ├── gemma.ts                 # ⭐ Cliente Gemma 4 completo
    │   ├── pcge.ts                  # Catálogo PCGE peruano (~50 cuentas)
    │   ├── notify.ts                # ⚠️ notifyContador — EXISTE pero NUNCA SE LLAMA
    │   └── supabase/
    │       ├── client.ts            # Browser client
    │       ├── server.ts            # Server client (SSR)
    │       └── admin.ts             # Service role (server-only)
    ├── components/
    │   ├── empresa-switcher.tsx     # Select con localStorage + CustomEvent
    │   ├── upload-zone.tsx          # Drag&drop, validación, estados
    │   ├── periodo-selector.tsx     # Input month con router push
    │   └── ui/                      # 14 componentes shadcn/ui
    │       button, card, input, label, select, badge, table,
    │       dropdown-menu, tabs, separator, avatar, progress,
    │       skeleton, dialog, sonner
    └── app/
        ├── layout.tsx               # Root layout
        ├── globals.css
        ├── page.tsx                 # Landing/redirect
        ├── (auth)/
        │   ├── layout.tsx
        │   ├── login/page.tsx       # Login Supabase
        │   └── register/page.tsx    # Registro + creación perfil
        ├── (dashboard)/
        │   ├── layout.tsx           # ⭐ Server Component: auth check + empresas list
        │   ├── _components/
        │   │   ├── dashboard-header.tsx  # Avatar dropdown, logout, empresa badge
        │   │   └── sidebar-nav.tsx       # Links de navegación
        │   ├── dashboard/page.tsx        # KPIs, últimos docs, acciones rápidas
        │   ├── documentos/page.tsx       # Lista docs + upload dialog
        │   ├── reportes/page.tsx         # KPIs + tabla PCGE + export link
        │   ├── exportar/page.tsx         # Card de descarga Excel
        │   ├── empresas/
        │   │   ├── page.tsx              # CRUD tabla empresas
        │   │   └── components/
        │   │       └── empresa-dialog.tsx # Modal crear/editar
        │   └── config/page.tsx           # Vinculación Telegram
        ├── upload/
        │   └── [token]/
        │       ├── page.tsx              # Página pública (Server Component, valida token)
        │       ├── upload-client.tsx     # Countdown + UploadZone
        │       └── not-found.tsx
        └── api/
            ├── auth/
            │   ├── logout/route.ts       # POST → signOut
            │   └── register/route.ts     # POST → upsert profiles
            ├── empresas/
            │   ├── route.ts              # GET lista / POST crear
            │   └── [id]/route.ts         # PUT editar / DELETE eliminar
            ├── documents/
            │   ├── process/route.ts      # ⚠️ Upload sin OCR (ver PROBLEMA #1)
            │   └── confirm/route.ts      # PUT confirmar clasificación
            ├── upload-token/route.ts     # POST generar token cliente externo
            ├── export/
            │   └── excel/route.ts        # ⭐ GET → OCR diferido + XLSX 3 hojas
            └── telegram/
                ├── webhook/route.ts      # POST handler completo
                └── generate-token/route.ts # POST generar código vinculación
```

### 2.6 Variables de entorno requeridas

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # Pública, en cliente
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # ⚠️ SOLO server

# OpenRouter (Gemma 4)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemma-4-31b-it:free   # El modelo principal

# Telegram
TELEGRAM_BOT_TOKEN=123456789:AAF...
TELEGRAM_WEBHOOK_SECRET=algún_string_secreto

# App
NEXT_PUBLIC_APP_URL=https://contaai-mu.vercel.app
```

### 2.7 Comandos útiles

```bash
npm run dev        # Servidor local en localhost:3000
npm run build      # Build producción
npm run lint       # ESLint
npx tsc --noEmit   # Verificar tipos (actualmente: 0 errores)
vercel --prod      # Deploy a producción
```

---

## ═══════════════════════════════════════
## PARTE 3 — ESTADO ACTUAL DE CADA MÓDULO
## ═══════════════════════════════════════

### M1 — Autenticación ✅ 90% funcional

**Lo que funciona:**
- Login con email/password → redirige a /dashboard
- Error en español: "Credenciales incorrectas. Verifica tu email y contraseña."
- Logout desde dropdown del avatar → redirige a /login
- Protección de rutas: /documentos sin sesión → redirige a /login (vía Server Component layout)
- Registro nuevo usuario → crea perfil en `profiles` → redirige a /dashboard
- Botón deshabilitado durante loading
- Alerta de "sesión cerrada por inactividad" en login (con `?reason=idle`)

**Limitación:**
- `proxy.ts` (middleware) tiene el nombre incorrecto → idle timeout de 30 min y redirect de auth-routes-when-logged-in están en el código pero NO activos en nuevo deploy. En el deploy actual funcionan porque el build fue compilado cuando existía el archivo correcto.

---

### M2 — Gestión de Empresas ✅ 85% funcional

**Lo que funciona:**
- Listado de empresas con columnas: nombre, RUC, rubro, régimen, contrato, acciones
- Badge "Activa" para la empresa activa (leída de localStorage)
- Botón "+ Nueva empresa" → modal shadcn Dialog
- Formulario con campos: nombre (req), RUC (11 dígitos), rubro (req), régimen (dropdown: RMT/RER/RG/NRUS), tipo contrato (Por mes/Fijo)
- Validación de RUC en API: regex `/^\d{11}$/` → error 400 con mensaje
- Crear empresa: guarda en BD, aparece en lista
- Editar empresa: modal pre-cargado con datos actuales, botón "Guardar cambios"
- Eliminar empresa: protección si tiene documentos (`"No se puede eliminar: tiene N documentos"`)
- Switcher en sidebar: Select component con localStorage + CustomEvent
- Estado vacío con mensaje claro + botón "Crear empresa"
- Onboarding nuevo usuario: sidebar muestra "+ Agregar empresa" (link) en lugar del switcher
- Aislamiento: usuario nuevo NO ve empresas de otros usuarios ✅

**Bugs conocidos:**
- `window.confirm()` para confirmar eliminación → **congela el renderer en entornos automatizados** (causa timeout de 30s en Chrome DevTools). Es UX obsoleto además.
- Validación RUC inválido en frontend: bloquea el submit SILENCIOSAMENTE (sin mensaje de error visible al usuario). La API SÍ valida y retorna error, pero el frontend no llega a enviar.
- El switcher en el sidebar NO se actualiza en tiempo real al crear una empresa estando en /empresas. Requiere navegar a otra página para que el layout Server Component re-renderice con las nuevas empresas.
- Sin toast de éxito tras crear/editar empresa (sonner está instalado pero no se usa).

---

### M3 — Documentos: Upload ⚠️ 40% — PROBLEMA CRÍTICO

**Lo que funciona:**
- Botón "Subir documento" → modal con área drag & drop
- Validación frontend: tipo (JPG/PNG/PDF), tamaño (≤5MB), con mensajes de error
- Upload a Supabase Storage bucket 'documentos'
- Registro en BD con estado 'pendiente'
- Estado vacío correcto: "No hay documentos en 2026-05. Sube tu primera factura o boleta."
- Selector de período (input type="month")
- Botón deshabilitado si no hay empresa activa
- Tabla con columnas: tipo, emisor, fecha, base, IGV, cuenta PCGE, estado (badge), confianza

**PROBLEMA CENTRAL — El OCR con Gemma 4 NO ocurre al hacer upload:**

`src/app/api/documents/process/route.ts` hace esto:
1. Valida auth y empresa_id
2. Valida archivo
3. Sube a Storage
4. Inserta registro MÍNIMO en BD:
   ```json
   { "empresa_id": "...", "tipo": "factura", "storage_path": "...",
     "estado": "pendiente", "periodo": "2026-05" }
   ```
5. Retorna el documento

**NO llama a `extractInvoiceData()` ni `classifyPCGE()`.**

Todos estos campos quedan NULL: `ruc_emisor`, `razon_social`, `fecha_emision`, `monto_base`, `igv`, `total`, `cuenta_pcge`, `nombre_cuenta`, `descripcion_ia`, `es_deducible`, `confianza_ia`.

El mensaje que muestra la UI tras el upload confirma este comportamiento:
> "Los datos se extraerán automáticamente al exportar a Excel."

Consecuencia: el flujo descrito en architecture.md (spinner "🤖 Gemma 4 analizando...", datos extraídos, clasificación PCGE sugerida, badge confianza, botón confirmar) **NO EXISTE**.

Consecuencia adicional: `notify.ts` NUNCA ES LLAMADA desde process/route.ts ni desde ningún otro archivo. El contador NO recibe notificación de Telegram cuando llega un documento.

**El tipo siempre es 'factura'** (hardcodeado en el insert): `tipo: 'factura'`. Nunca clasifica como 'boleta'.

---

### M3b — Documentos: Clasificación y Confirmación ⚠️ 70% funcional

**Lo que existe:**
- `api/documents/confirm/route.ts` (PUT): recibe `documento_id` + `cuenta_pcge`, verifica pertenencia (doble validación: RLS + comprobación de empresa), actualiza `estado = 'confirmado'`, resuelve `nombre_cuenta` del catálogo PCGE si no se envía, retorna el documento actualizado.

**Problema:** Este endpoint funciona correctamente, pero la UI de /documentos NO tiene botón "Confirmar" en cada fila de documento, ni modal de edición de cuenta PCGE. Solo muestra la tabla con los datos (que están todos NULL después del upload). No hay flujo de revisión visual.

---

### M4 — Gemma 4 — lib/gemma.ts ✅ 100% implementado (pero poco usado en tiempo real)

El módulo es excelente técnicamente:

```typescript
// extractInvoiceData: OCR multimodal
// → Envía imagen como base64 a Gemma 4
// → Extrae: tipo, serie_numero, ruc_emisor, razon_social,
//           fecha_emision, monto_base, igv, total, descripcion
// → Prompt explícito: "null si no visible"

// classifyPCGE: clasificación contable
// → System prompt con rubro y régimen de la empresa
// → Extrae: cuenta_pcge, nombre_cuenta, es_deducible,
//           razon, confianza (0-1), alerta
// → temperature=0.05 para consistencia
// → Fallback gracioso: retorna cuenta 60.9 si falla el JSON

// classifyIntent: routing del bot
// → Keywords primero (0ms, sin costo)
// → Gemma 4 solo para mensajes ambiguos
// → temperature=0 para determinismo
// → 5 intents: upload, query_igv, query_vencimiento, query_facturas, unknown

// callGemma4: función interna con fallback
// → Intenta OPENROUTER_MODEL (Gemma 4) primero
// → En 429: espera 3s, intenta llama-4-scout:free
// → En 429: espera 3s, intenta llama-4-maverick:free
// → parseJSON: strips ```json fences + regex fallback
```

**Uso actual de Gemma 4:**
- ✅ Llamada en `api/export/excel/route.ts` (diferido, al exportar)
- ✅ Llamada en `api/telegram/webhook/route.ts` (classifyIntent)
- ❌ NO se llama en `api/documents/process/route.ts` (debería ser el principal)

---

### M5 — Bot de Telegram ✅ 85% funcional

**Lo que funciona:**
- Webhook POST con verificación `x-telegram-bot-api-secret-token` ✅
- Rechazo de archivos con mensaje educativo en español ✅
- `/start` sin token → instrucciones de vinculación ✅
- `/start TOKEN` → vincula telegram_id al perfil, invalida token ✅
- `/start` con cuenta ya vinculada → saludo con nombre ✅
- `/empresa NOMBRE` → cambia empresa activa (en memoria de la sesión del bot) ✅
- Intent `upload` → genera upload_token + URL + mensaje con expiración ✅
- Intent `query_igv` → suma IGV de documentos del período actual ✅
- Intent `query_vencimiento` → fecha referencial día 15 del mes siguiente ✅
- Intent `query_facturas` → conteo confirmados/pendientes/total ✅
- Respuestas NUNCA exponen RUC emisor ni razón social (solo totales agregados) ✅
- GET → registra webhook con Telegram (llamar una vez tras deploy) ✅

**Limitaciones:**
- `notify.ts` no se llama → el contador NO recibe notificación cuando llega un documento
- La empresa activa en el bot no persiste entre sesiones (se usa siempre `empresas[0]` o la última del comando `/empresa`)
- El token de vinculación usa `Math.random().toString(36)` — no criptográficamente seguro (aunque tiene vida corta)

---

### M6 — Reportes ✅ 95% funcional

**Lo que funciona:**
- 2 KPI cards: Total IGV y Base Imponible (solo docs confirmados)
- Tabla agrupada por cuenta PCGE: cuenta, nombre, N docs, base, IGV, total
- Fila TOTAL al pie de la tabla (TableFooter)
- Estado vacío claro con instrucción
- Selector de período
- Botón "Exportar Excel" (link a API)
- Skeleton loaders durante carga
- Escucha CustomEvent 'empresaChanged' para actualizar al cambiar empresa

**Limitación:**
- Agrupación por cuenta PCGE se hace en JavaScript del cliente (no en SQL). Funcional pero menos eficiente con volumen alto.

---

### M7 — Export Excel ✅ 90% funcional (con OCR diferido de Gemma 4)

**Lo que hace `api/export/excel/route.ts`:**
1. Auth + validación de empresa
2. Obtiene TODOS los documentos del período (no solo confirmados)
3. Para cada doc con `ruc_emisor === null` (sin datos de IA):
   - Descarga imagen de Supabase Storage
   - Llama `extractInvoiceData()` (Gemma 4 OCR)
   - Llama `classifyPCGE()` (Gemma 4 clasificación)
   - Actualiza el registro en BD
4. Genera XLSX con 3 hojas:
   - **Hoja 1 "Registro de Compras"**: período, tipo, fecha, RUC, razón social, base, IGV, total, cuenta PCGE, nombre cuenta, deducible, estado
   - **Hoja 2 "Resumen por Cuenta"**: cuenta, nombre, N docs, base total, IGV total + fila TOTAL
   - **Hoja 3 "Información"**: empresa, RUC, período, totales, "Generado por ContaAI con Gemma 4"
5. Nombre del archivo: `contaai-{empresa-sanitizada}-{periodo}.xlsx`

**Bugs:**
- Timeout de Vercel en 60s: si hay muchos documentos sin procesar, puede fallar
- `totalConfirmados` en `exportar/page.tsx` se inicializa en `null` (no `0`), causando que el botón muestre "null docs" durante ~1s de hidratación antes de cargar los datos reales

---

### M8 — Configuración / Vinculación Telegram ✅ 95% funcional

**Lo que funciona:**
- Muestra estado: vinculado (con telegram_id) vs no vinculado
- Si vinculado: badge con ID, botón "Desvincular"
- Si no vinculado: botón "Generar código de vinculación"
- Al generar: muestra código de 6 chars (ej: `84M81F`), instrucción `/start 84M81F`, botón copiar al portapapeles
- Botón "Regenerar código"
- Desvincular: limpia telegram_id del perfil

**Limitación:**
- Solo muestra sección Telegram, sin otras opciones de configuración (cambio de contraseña, datos de perfil, notificaciones)

---

### M9 — Dashboard Home ✅ 100% funcional

**Lo que funciona:**
- 4 KPI cards: Total IGV, Base Imponible, Confirmados, Pendientes
- Alerta de vencimiento SUNAT cuando quedan ≤5 días (banner rojo)
- Tabla "Últimos documentos" (máx 5, solo si hay datos)
- 3 acciones rápidas: Subir documento, Ver reportes, Exportar Excel
- Estado vacío si no hay empresa seleccionada
- Skeleton durante carga
- Escucha CustomEvent 'empresaChanged'

---

### M10 — /upload/[token] (Upload público cliente externo) ✅ 95% funcional

**Lo que funciona:**
- Server Component valida token: no expirado, no usado
- Si inválido → 404
- Muestra nombre de empresa del token
- Countdown en tiempo real hasta expiración
- Si expirado: mensaje "Este enlace ha expirado"
- Al subir: misma UploadZone, misma validación, llama al mismo endpoint
- Mensaje final: "Tu documento fue recibido. El contador revisará y clasificará."

**Limitación:**
- Sufre el mismo problema que el upload desde dashboard: no hay OCR en tiempo real

---

## ═══════════════════════════════════════
## PARTE 4 — TODOS LOS BUGS Y PROBLEMAS
## ═══════════════════════════════════════

### 🔴 CRÍTICOS (impiden funcionalidad core o seguridad)

---

**BUG #1 — OCR diferido: Gemma 4 no se llama al subir documentos**

- **Archivo:** `src/app/api/documents/process/route.ts`
- **Descripción:** El endpoint de upload NO llama a `extractInvoiceData()` ni `classifyPCGE()`. Inserta un registro mínimo en BD y retorna. Todos los campos de IA quedan NULL. El OCR ocurre solo cuando se exporta Excel.
- **Impacto para el concurso:** El flujo más impresionante (usuario sube factura → Gemma 4 analiza en vivo → muestra datos extraídos → clasifica en PCGE → usuario confirma) no existe en la UI actual.
- **Impacto en UX:** La tabla de documentos muestra todo como "—" hasta exportar Excel.
- **Fix:** En `process/route.ts`, después del storage upload, llamar a `extractInvoiceData()` y `classifyPCGE()`. Actualizar el insert con todos los campos. Devolver el documento completo al frontend. En el frontend (`upload-zone.tsx`), mostrar los datos extraídos con opción de editar cuenta PCGE y botón "Confirmar".

---

**BUG #2 — `middleware.ts` faltante: protección de rutas incompleta**

- **Archivo:** `src/proxy.ts` (debería ser `src/middleware.ts`)
- **Descripción:** El archivo `proxy.ts` contiene toda la lógica del middleware de Next.js (exports correctos: `async function proxy()` + `export const config`) pero está mal nombrado. Next.js busca `middleware.ts` en la raíz del proyecto o `src/`. Al no existir, el middleware no se ejecuta en nuevos deploys.
- **Por qué funciona en producción:** El build actual en Vercel fue compilado cuando el archivo tenía el nombre correcto. El `.next/server/middleware.js` compilado existe y funciona. Pero en un fresh deploy, fallaría.
- **Qué se pierde sin middleware activo:**
  - Idle timeout de 30 minutos (logout automático por inactividad)
  - Redirect a /dashboard cuando usuario autenticado accede a /login o /register
  - (La protección de rutas privadas SÍ funciona via layout Server Component)
- **Fix:** `mv src/proxy.ts src/middleware.ts`

---

**BUG #3 — `notify.ts` nunca se llama: notificaciones Telegram rotas**

- **Archivo:** `src/lib/notify.ts` (existe pero nunca importada)
- **Descripción:** La función `notifyContador(empresaId, resumen)` está completamente implementada: obtiene el telegram_id del contador de la BD, construye el mensaje (sin datos sensibles del proveedor), envía via Telegram API. Pero no existe ningún `import { notifyContador }` en todo el codebase.
- **Impacto:** El contador NUNCA recibe "📢 Nuevo documento procesado → cuenta 60.1 → 94% confianza → [Ver en dashboard]"
- **Fix:** En `process/route.ts`, después de guardar el documento con datos de IA, llamar `await notifyContador(empresaId, { tipo, total, cuenta: cuenta_pcge, nombre_cuenta, confianza })`.

---

**BUG #4 — `window.confirm()` congela el renderer**

- **Archivo:** `src/app/(dashboard)/empresas/page.tsx` línea 68
- **Código:**
  ```typescript
  if (!window.confirm(`¿Eliminar "${empresa.nombre}"? Esta acción no se puede deshacer.`)) {
    return
  }
  ```
- **Descripción:** El dialog nativo del browser bloquea el hilo de JavaScript. En Chrome DevTools Protocol (y cualquier browser automation), esto causa un timeout de 30s porque el renderer queda congelado esperando interacción del usuario.
- **Impacto:** Cualquier usuario que haga clic en el botón eliminar experimenta ~1s de freeze visible. En tests automatizados: timeout completo.
- **Fix:** Reemplazar por `<AlertDialog>` de shadcn/ui:
  ```tsx
  // Usar: import { AlertDialog, AlertDialogAction, AlertDialogCancel,
  //   AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  //   AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
  ```

---

### 🟡 MEDIOS (afectan UX o calidad, no son bloqueantes)

---

**BUG #5 — "null docs" en botón de exportar durante hidratación**

- **Archivo:** `src/app/(dashboard)/exportar/page.tsx` línea 24
- **Código:**
  ```typescript
  const [totalConfirmados, setTotalConfirmados] = useState<number | null>(null)
  ```
- **Descripción:** Mientras el componente carga, `totalConfirmados` es `null`. El botón renderiza:
  ```typescript
  `Descargar Excel (${totalConfirmados} docs)` → "Descargar Excel (null docs)"
  ```
  Visible durante ~500ms de hidratación antes de que lleguen los datos.
- **Fix:**
  ```typescript
  const [totalConfirmados, setTotalConfirmados] = useState<number>(0)
  ```

---

**BUG #6 — Validación de RUC silenciosa en el frontend**

- **Archivo:** `src/app/(dashboard)/empresas/components/empresa-dialog.tsx`
- **Descripción:** El formulario del modal tiene un campo RUC. Cuando se ingresa un RUC con menos de 11 dígitos y se hace clic en "Crear empresa", el form no se envía (la API rechazaría con error 400), pero no aparece ningún mensaje de error en la UI. El usuario no sabe qué campo es inválido.
- **Fix:** Agregar validación en el handler del submit + mostrar mensaje debajo del campo:
  ```tsx
  {rucError && <p className="text-sm text-destructive">{rucError}</p>}
  ```

---

**BUG #7 — Tipo 'factura' hardcodeado en process/route.ts**

- **Archivo:** `src/app/api/documents/process/route.ts` línea 104
- **Código:**
  ```typescript
  tipo: 'factura',  // ← siempre factura, nunca boleta
  ```
- **Descripción:** Todos los documentos se insertan como tipo 'factura', independientemente de lo que muestre la imagen. Esto se corrije cuando Gemma 4 clasifica en el export, pero hasta entonces los datos son incorrectos.
- **Fix:** Al implementar el OCR en tiempo real, usar `extraccion.tipo ?? 'factura'`.

---

**BUG #8 — Switcher no se actualiza en tiempo real al crear empresa**

- **Archivo:** `src/components/empresa-switcher.tsx` / `src/app/(dashboard)/layout.tsx`
- **Descripción:** El `EmpresaSwitcher` recibe `empresas` como prop desde el layout Server Component. Al crear una empresa en `/empresas`, la lista de empresas del switcher en el sidebar NO se actualiza hasta que el usuario navega a otra página (forzando un re-render del layout).
- **Causa:** El layout es un Server Component que solo re-fetch al navegar, no en respuesta a mutaciones del cliente.
- **Fix:** Después de crear/editar empresa exitosamente, hacer `router.refresh()` en el handler de éxito del dialog.

---

**BUG #9 — Sin feedback de éxito en operaciones CRUD de empresas**

- **Descripción:** Al crear, editar o eliminar una empresa, la operación se completa silenciosamente. El modal se cierra y la lista se actualiza, pero no hay ningún toast de confirmación.
- **sonner está instalado** (`"sonner": "^2.0.7"` en package.json) pero nunca se importa en ningún componente.
- **Fix:**
  ```typescript
  import { toast } from 'sonner'
  // En handleSuccess:
  toast.success('Empresa creada correctamente')
  ```

---

### 🟢 MENORES (mejoras de calidad o detalles)

---

**BUG #10 — Token de vinculación Telegram no criptográfico**

- **Archivo:** `src/app/api/telegram/generate-token/route.ts` línea 13
- **Código:** `const token = Math.random().toString(36).slice(2, 8).toUpperCase()`
- **Descripción:** `Math.random()` no es criptográficamente seguro. Si bien el token tiene 6 chars y corta vida (se invalida al usarse), es mejor práctica.
- **Contraste:** `upload-token/route.ts` SÍ usa `crypto.randomUUID()` correctamente.
- **Fix:** `const bytes = new Uint8Array(4); crypto.getRandomValues(bytes); const token = Array.from(bytes, b => b.toString(36)).join('').slice(0, 6).toUpperCase()`

---

**BUG #11 — Dashboard no muestra "Últimos documentos" cuando los hay**

- **Descripción:** La sección "Últimos documentos" del dashboard solo aparece si `recientes.length > 0`. Pero como el OCR es diferido, los documentos tienen todos los campos en NULL. La tabla mostraría "—" en todas las columnas. No es un error de código pero sí de experiencia.

---

**BUG #12 — Falta edición de cuenta PCGE en tabla de documentos**

- **Archivo:** `src/app/(dashboard)/documentos/page.tsx`
- **Descripción:** La tabla muestra cuenta PCGE, estado y confianza, pero no hay botón para editar la clasificación de un documento ya existente. Para cambiar la cuenta, habría que... no hay forma UI.
- **La API existe:** `PUT /api/documents/confirm` acepta `cuenta_pcge` editable.
- **Fix:** Agregar un Dialog de edición al hacer clic en una fila, con un Select/Datalist de cuentas PCGE y botón confirmar.

---

**BUG #13 — No existe página de detalle de documento**

- **Descripción:** Al hacer clic en una fila de documento, no pasa nada (no hay link, no hay modal de detalle). No se puede ver la imagen original del documento ni todos sus metadatos.

---

**BUG #14 — No existe botón eliminar documento**

- **Descripción:** La tabla de documentos en `/documentos` no tiene botón eliminar ni botón de acción por fila. Solo se muestra la información.

---

## ═══════════════════════════════════════
## PARTE 5 — LO QUE FUNCIONA BIEN (sin problemas)
## ═══════════════════════════════════════

Estas funcionalidades están completas y funcionan correctamente en producción:

✅ Login / Logout / Registro  
✅ Protección de rutas (vía layout Server Component)  
✅ Aislamiento total entre usuarios (RLS + validación API)  
✅ Crear empresa con validación completa  
✅ Editar empresa con datos pre-cargados  
✅ Empresa switcher con localStorage + CustomEvent  
✅ Onboarding nuevo usuario ("+ Agregar empresa")  
✅ Upload de documentos (archivo llega al storage)  
✅ Validación de tipo/tamaño de archivo (frontend + backend)  
✅ Reportes agrupados por cuenta PCGE  
✅ Export Excel con 3 hojas (Registro, Resumen, Información)  
✅ OCR Gemma 4 funcionando en el export (diferido)  
✅ Clasificación PCGE con contexto de rubro y régimen  
✅ Fallback automático a Llama 4 cuando Gemma 4 da 429  
✅ Bot Telegram: vinculación con código de 6 chars  
✅ Bot Telegram: rechaza archivos con mensaje educativo  
✅ Bot Telegram: 4 intents funcionales (IGV, vencimiento, facturas, upload link)  
✅ Página pública /upload/[token] con countdown  
✅ Token de upload con expiración de 15 min y marca de "usado"  
✅ API confirm: cambia estado a 'confirmado' con doble validación de seguridad  
✅ Generación de código Telegram + instrucciones claras  
✅ Dashboard KPIs con alerta de vencimiento SUNAT  
✅ TypeScript: 0 errores en strict mode  
✅ Estados de carga (skeletons) en todas las páginas  
✅ Estados vacíos con mensajes claros en español  
✅ Selector de período en documentos, reportes y exportar  
✅ Diseño consistente con shadcn/ui en toda la app  

---

## ═══════════════════════════════════════
## PARTE 6 — LO QUE FALTA CONSTRUIR
## ═══════════════════════════════════════

### 6.1 Crítico para el concurso (sin esto la demo no impacta)

**A) Flujo OCR en tiempo real — estimado: 4 horas**

Cambiar la arquitectura del upload para que Gemma 4 clasifique en el momento:

```
Flujo actual:   upload → guardar → "datos al exportar"
Flujo correcto: upload → Gemma 4 OCR → clasificar PCGE → mostrar resultados → confirmar
```

Componentes a crear/modificar:
1. `process/route.ts`: llamar a `extractInvoiceData()` y `classifyPCGE()` tras el storage upload
2. Nuevo componente de resultados en `upload-zone.tsx` o un Dialog aparte:
   - Imagen preview del documento
   - Datos extraídos: emisor, RUC, fecha, montos
   - Cuenta PCGE sugerida (editable con datalist/autocomplete del PCGE)
   - Badge "Deducible" / "No deducible"
   - Porcentaje de confianza
   - Botón "✅ Confirmar" → llama a `confirm/route.ts`
   - Botón "Editar cuenta" → Select con todas las cuentas del PCGE
3. Spinner durante el análisis: "🤖 Gemma 4 analizando..."

**B) Activar middleware — estimado: 5 minutos**

```bash
mv src/proxy.ts src/middleware.ts
```

**C) Notificaciones Telegram — estimado: 30 minutos**

En `process/route.ts`, al final del proceso exitoso:
```typescript
import { notifyContador } from '@/lib/notify'

// Después de obtener los datos de IA:
await notifyContador(empresaId, {
  tipo: extraccion.tipo ?? 'factura',
  total: extraccion.total,
  cuenta: clasificacion.cuenta_pcge,
  nombre_cuenta: clasificacion.nombre_cuenta,
  confianza: clasificacion.confianza,
})
```

### 6.2 Importante para UX y calidad

**D) Reemplazar window.confirm() por AlertDialog — 30 minutos**

**E) Editar/confirmar clasificación desde la tabla de documentos — 1 hora**
- Clic en fila → Dialog con datos completos del documento
- Select/Combobox de cuentas PCGE (usar `PCGE_CUENTAS` de `lib/pcge.ts`)
- Botón "Confirmar" → PUT /api/documents/confirm
- Botón "Eliminar" → DELETE endpoint (a crear)

**F) Toasts de éxito con sonner — 20 minutos**

**G) Fix "null docs" en exportar page — 5 minutos**

**H) Mensaje de error visible para RUC inválido — 15 minutos**

### 6.3 Opcional (bonus)

- Eliminar documento (DELETE /api/documents/:id)
- Página de detalle de documento con imagen original
- Múltiples períodos en reportes (comparativa)
- Cambio de contraseña en /config
- Datos de perfil editables (nombre)
- Modo oscuro (next-themes ya instalado)

---

## ═══════════════════════════════════════
## PARTE 7 — ANÁLISIS DE SEGURIDAD
## ═══════════════════════════════════════

### Verificado y correcto ✅

- Todas las API routes autentican con `supabase.auth.getUser()` antes de procesar
- UPDATE y DELETE de empresa incluyen `.eq('user_id', user.id)` — doble validación
- DELETE de empresa verifica que no tenga documentos antes de eliminar
- Confirm document: verifica empresa de pertenencia + RLS
- `SUPABASE_SERVICE_ROLE_KEY` solo en `src/lib/supabase/admin.ts` (server-side)
- Webhook Telegram verifica `x-telegram-bot-api-secret-token` en cada request
- Bot rechaza archivos con mensaje educativo
- Bot nunca expone RUC emisor, razón social, ni montos individuales (solo agregados)
- Storage paths sanitizados (ext limpiada de caracteres especiales)
- Tokens de upload con expiración + flag `usado` (no reutilizables)

### Problemas de seguridad encontrados

| # | Severidad | Descripción | Fix |
|---|-----------|-------------|-----|
| V1 | Alta | `middleware.ts` faltante: idle timeout no activo en nuevo deploy | Renombrar proxy.ts |
| V2 | Media | Token Telegram con `Math.random()` | Usar `crypto.getRandomValues` |
| V3 | Baja | `window.confirm()` bloqueante | Usar AlertDialog |

---

## ═══════════════════════════════════════
## PARTE 8 — RESULTADO DE LA AUDITORÍA QA EN VIVO
## ═══════════════════════════════════════

*Auditoría ejecutada el 23 mayo 2026 sobre https://contaai-mu.vercel.app con dos sesiones*

### Sesión 1 — Usuario existente (ana@gmail.com)

| Aspecto | Resultado |
|---------|-----------|
| Login con credenciales incorrectas | ✅ Muestra error en español |
| Login correcto | ✅ Redirige a /dashboard |
| Logout | ✅ Cierra sesión, redirige a /login |
| Acceso sin sesión a /documentos | ✅ Redirige a /login |
| Dashboard KPIs | ✅ 4 cards correctos |
| Alerta vencimiento SUNAT | ⚠️ No visible el 23/05 (faltan 8 días, umbral es ≤5) |
| Empresa switcher | ✅ Funciona, muestra empresa activa |
| /empresas lista | ✅ Muestra tabla con badge "Activa" |
| Crear empresa RUC 8 dígitos | ⚠️ Bloquea silenciosamente (sin mensaje) |
| Crear empresa datos válidos | ✅ Se guarda y aparece en lista |
| Editar empresa | ✅ Modal pre-cargado, guarda correctamente |
| Eliminar empresa | ❌ Congela el renderer (window.confirm) |
| /documentos estado vacío | ✅ Mensaje claro + botón subir |
| Modal upload | ✅ Drag&drop, "PDF/JPG/PNG — máx 5MB" |
| Gemma 4 OCR al subir | ❌ No ocurre — "datos al exportar" |
| /reportes | ✅ KPIs + estado vacío correcto |
| Export Excel botón | ⚠️ Muestra "null docs" durante ~500ms |
| /exportar | ✅ Existe, muestra 3 hojas info |
| /config | ✅ Existe |
| Generar código Telegram | ✅ Genera "84M81F", instrucciones claras |
| Toast de éxito tras operaciones | ❌ No existe |

### Sesión 2 — Usuario nuevo (qa-test-1748044800@prueba.com)

| Aspecto | Resultado |
|---------|-----------|
| Registro nuevo usuario | ✅ Funciona, redirige a /dashboard |
| Dashboard sin empresas | ✅ Sidebar muestra "+ Agregar empresa" |
| /empresas sin empresas | ✅ "No tienes empresas registradas" + botón crear |
| Aislamiento: no ve imteclo | ✅ Datos completamente aislados |
| Crear primera empresa (Panadería San José) | ✅ Se crea correctamente |
| Switcher no actualiza en /empresas | ⚠️ Requiere navegar para actualizar |
| Dashboard tras crear empresa | ✅ Muestra "Panadería San José · Mayo 2026" |
| Datos del usuario Sesión 1 visibles | ✅ No se ven — aislamiento correcto |

### Páginas auditadas

| Página | Estado |
|--------|--------|
| /login | ✅ Funcional |
| /register | ✅ Funcional |
| /dashboard | ✅ Funcional |
| /documentos | ✅ Funcional (sin OCR en tiempo real) |
| /reportes | ✅ Funcional |
| /exportar | ✅ Funcional (bug null docs) |
| /empresas | ✅ Funcional (bug eliminar freeze) |
| /config | ✅ Funcional |
| /upload/[token] | ✅ No auditada en vivo (no se generó token desde bot) |

---

## ═══════════════════════════════════════
## PARTE 9 — EVALUACIÓN PARA EL CONCURSO
## ═══════════════════════════════════════

### Estado actual

| Criterio | Puntaje actual | Con fixes |
|----------|---------------|-----------|
| Uso intencional y efectivo de Gemma 4 | 5/10 | 10/10 |
| Implementación técnica y calidad del código | 8/10 | 9/10 |
| Creatividad y originalidad | 8/10 | 8/10 |
| Usabilidad y experiencia de usuario | 7/10 | 9/10 |
| **TOTAL** | **28/40** | **36/40** |

### Competitividad
- **Estado actual:** Media (el código de Gemma 4 es bueno pero no se ve)
- **Con OCR en tiempo real:** Alta (flujo completo visible y único)

### Por qué este proyecto ES competitivo (fortalezas reales)

1. **Dominio muy específico**: PCGE peruano, regímenes SUNAT, boletas vs facturas — no es un demo genérico
2. **Multimodal genuino**: envía imágenes reales de comprobantes, no texto
3. **Contextual**: clasifica diferente una factura de ferretería vs restaurant vs transporte
4. **Fallback inteligente**: si Gemma 4 falla por 429, usa Llama 4 automáticamente
5. **Arquitectura end-to-end**: web + bot Telegram + upload público + notificaciones
6. **Código limpio**: TypeScript strict, 0 errores, buenas prácticas

### Qué demostrar en el video (orden ideal)

1. Subir imagen de factura real peruana → spinner "🤖 Gemma 4 analizando" → datos extraídos → cuenta PCGE sugerida → confirmar → aparece en tabla con estado "Confirmado"
2. Enviar "¿cuánto IGV llevo este mes?" al bot de Telegram → respuesta con total del período
3. Enviar "subir factura" al bot → recibir link seguro → abrir en móvil → subir → contador recibe notificación
4. Exportar Excel → abrir 3 hojas → mostrar datos clasificados

### Qué mencionar en el post

- Gemma 4 como modelo de visión: base64 → JSON estructurado con 9 campos de un comprobante peruano
- Clasificación contextual: mismo gasto, diferente cuenta según rubro y régimen
- Fallback multi-modelo sin interrumpir al usuario
- Hybrid intent: keywords primero, Gemma 4 solo para mensajes ambiguos (eficiencia en free tier)

---

## ═══════════════════════════════════════
## PARTE 10 — TABLA RESUMEN SPEC VS IMPLEMENTADO
## ═══════════════════════════════════════

| Funcionalidad | Spec | Código | UI visible | %  |
|---------------|------|--------|------------|----|
| Login/Register/Logout | ✅ | ✅ | ✅ | 100% |
| Middleware (idle timeout) | ✅ | ✅ proxy.ts | ❌ no activo | 20% |
| CRUD empresas | ✅ | ✅ | ✅ | 85% |
| Upload archivo (storage) | ✅ | ✅ | ✅ | 100% |
| OCR Gemma 4 en tiempo real | ✅ | ❌ | ❌ | 0% |
| OCR Gemma 4 diferido (export) | - | ✅ | ❌ oculto | - |
| Clasificación PCGE en tiempo real | ✅ | ❌ | ❌ | 0% |
| Clasificación PCGE diferida (export) | - | ✅ | ❌ oculto | - |
| Confirmar/editar clasificación | ✅ | ✅ API | ❌ sin UI | 40% |
| Dashboard con KPIs | ✅ | ✅ | ✅ | 100% |
| Alerta vencimiento SUNAT | ✅ | ✅ | ✅ | 100% |
| Reportes PCGE por período | ✅ | ✅ | ✅ | 95% |
| Export Excel 3 hojas | ✅ | ✅ | ✅ | 90% |
| Bot Telegram webhook | ✅ | ✅ | - | 90% |
| Bot: /start vinculación | ✅ | ✅ | - | 100% |
| Bot: upload link seguro | ✅ | ✅ | - | 100% |
| Bot: query IGV | ✅ | ✅ | - | 100% |
| Bot: query vencimiento | ✅ | ✅ | - | 100% |
| Bot: query facturas | ✅ | ✅ | - | 100% |
| Notificación al contador | ✅ | ✅ notify.ts | ❌ no llamada | 0% |
| /upload/[token] pública | ✅ | ✅ | ✅ | 95% |
| Aislamiento multi-empresa | ✅ | ✅ | ✅ | 100% |
| Tipos TypeScript | ✅ | ✅ | - | 100% |
| **TOTAL IMPLEMENTACIÓN** | | | | **~78%** |

---

## ═══════════════════════════════════════
## PARTE 11 — PLAN DE ACCIÓN PRIORIZADO
## ═══════════════════════════════════════

### Prioridad 1 — Cambios críticos (hacer primero)

| # | Cambio | Archivo(s) | Tiempo |
|---|--------|------------|--------|
| P1 | Renombrar `proxy.ts` → `middleware.ts` | `src/proxy.ts` | 5 min |
| P2 | OCR en tiempo real en upload (server) | `src/app/api/documents/process/route.ts` | 2h |
| P3 | UI de resultados Gemma 4 post-upload | `src/components/upload-zone.tsx` + nuevo componente | 2h |
| P4 | Conectar notifyContador en process | `src/app/api/documents/process/route.ts` | 30 min |
| P5 | Fix null docs en exportar | `src/app/(dashboard)/exportar/page.tsx` línea 24 | 5 min |

### Prioridad 2 — Mejoras importantes

| # | Cambio | Archivo(s) | Tiempo |
|---|--------|------------|--------|
| P6 | Reemplazar window.confirm por AlertDialog | `src/app/(dashboard)/empresas/page.tsx` | 30 min |
| P7 | Toasts de éxito con sonner | `empresas/page.tsx`, `empresa-dialog.tsx` | 20 min |
| P8 | Mensaje error RUC inválido en frontend | `empresa-dialog.tsx` | 15 min |
| P9 | router.refresh() tras crear/editar empresa | `empresa-dialog.tsx` | 10 min |
| P10 | Botón confirmar/editar por fila en /documentos | `documentos/page.tsx` + Dialog | 1h |

### Prioridad 3 — Bonus

| # | Cambio | Tiempo |
|---|--------|--------|
| P11 | Token Telegram criptográfico | 10 min |
| P12 | DELETE documento | 30 min |
| P13 | Modal detalle documento con imagen | 1h |
| P14 | Cambio de contraseña en /config | 1h |

### Tiempo total estimado

| Prioridad | Tiempo |
|-----------|--------|
| Críticos (P1-P5) | ~5 horas |
| Importantes (P6-P10) | ~2 horas |
| Bonus (P11-P14) | ~2.5 horas |
| **Total para concurso competitivo** | **~7 horas** |

---

## ═══════════════════════════════════════
## PARTE 12 — REGLAS DE CÓDIGO A RESPETAR
## ═══════════════════════════════════════

Estas reglas están en `CLAUDE.md` y deben seguirse estrictamente:

```
TypeScript:
- strict mode SIEMPRE
- No usar 'any' excepto en catch blocks
- Tipar todos los retornos de funciones async

React:
- Server Components por defecto
- 'use client' solo si necesita interactividad
- Nombres en kebab-case: empresa-switcher.tsx
- Props interfaces siempre tipadas

API Routes:
- Validar auth PRIMERO
- Validar que empresa_id pertenece al usuario
- Status codes correctos: 401, 403, 400, 500
- NUNCA loggear montos, RUC, razones sociales

Base de datos:
- NUNCA queries sin filtro empresa_id
- RLS es última línea, no la única
- Validar pertenencia en API antes de llegar a Supabase
```

**RESTRICCIONES ABSOLUTAS (nunca hacer):**

```
❌ NUNCA exponer variables de entorno en código cliente
❌ NUNCA procesar archivos/documentos recibidos por Telegram
❌ NUNCA retornar RUCs, montos individuales o razones sociales por el bot
❌ NUNCA queries a BD sin filtro de empresa_id
❌ NUNCA usar service_role_key en código cliente
❌ NUNCA hacer polling en el bot de Telegram
❌ NUNCA hardcodear el modelo de Gemma
❌ NUNCA llamar a Gemma 4 directamente desde el frontend
❌ NUNCA guardar tokens de upload ya usados como válidos
❌ NUNCA mezclar datos de empresas distintas en una respuesta
```

---

## ═══════════════════════════════════════
## PARTE 13 — CONTEXTO DE NEGOCIO (Perú)
## ═══════════════════════════════════════

- **SUNAT:** Superintendencia Nacional de Aduanas y Administración Tributaria
- **RUC:** Registro Único de Contribuyentes — identificador fiscal de 11 dígitos
- **PCGE:** Plan Contable General Empresarial — sistema estándar de cuentas contables peruano
- **IGV:** Impuesto General a las Ventas — 18% del valor neto en facturas
- **Base imponible:** monto neto sin IGV (lo que se registra como gasto)
- **Total:** base + IGV
- **Factura:** comprobante entre empresas/negocios con RUC — genera crédito fiscal IGV
- **Boleta:** comprobante para personas naturales — no genera crédito fiscal
- **Regímenes tributarios:**
  - **RMT** (Régimen MYPE Tributario): tasa 10% hasta 15 UIT, 29.5% resto
  - **RER** (Régimen Especial de Renta): tasa fija 1.5% de ingresos netos
  - **RG** (Régimen General): tasa 29.5% sobre utilidades
  - **NRUS** (Nuevo RUS): cuota fija mensual, muy simplificado
- **Declaración:** mensual, fecha límite varía según último dígito del RUC
- **Deducible:** gasto que reduce la base del Impuesto a la Renta (ej: compras de insumos)
- **No deducible:** gasto que no aplica (ej: multas, gastos personales)

---

## ═══════════════════════════════════════
## APÉNDICE — OUTPUT DE TypeScript
## ═══════════════════════════════════════

```bash
$ cd C:/gemma4_proyec/contaai && npx tsc --noEmit

(sin output — 0 errores, 0 advertencias)
```

✅ **Compilación TypeScript 100% limpia en strict mode.**

---

*Documento generado mediante análisis estático completo del codebase + auditoría QA en vivo sobre la URL de producción. Cubre todos los archivos en src/, prompts/, skills/, y la experiencia de usuario observada en ambas sesiones de auditoría.*
