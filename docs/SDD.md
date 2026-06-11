# SDD — Software Design Document
## ContaAI — Asistente Contable Inteligente para MYPEs peruanas

**Versión:** 2.0 · **Última actualización:** 10 junio 2026
**Producción:** https://contaai-mu.vercel.app

---

## 1. Propósito

ContaAI automatiza la clasificación contable de comprobantes de pago peruanos
(facturas y boletas) usando **Gemma 4** vía OpenRouter como motor de visión e
inteligencia. Está dirigido a contadores independientes y MYPEs que declaran
mensualmente ante SUNAT.

Gemma 4 cumple tres roles (núcleo del sistema, no accesorio):

1. **OCR multimodal** — extrae datos estructurados de la imagen del comprobante
   en el momento de la subida (`extractInvoiceData`).
2. **Clasificación PCGE contextual** — asigna la cuenta contable según rubro y
   régimen tributario de la empresa (`classifyPCGE`).
3. **Chat inteligente en Telegram** — conversación natural con el contador
   sobre los datos agregados de su empresa (`chatContador`).

## 2. Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16.2.6 (App Router) + TypeScript strict + React 19 |
| UI | shadcn/ui (radix-ui) + Tailwind CSS v4 + sonner (toasts) |
| Base de datos | Supabase (PostgreSQL + RLS + Storage + Auth) |
| IA | OpenRouter → `google/gemma-4-31b-it:free` con fallback |
| Bot | Telegram Bot API — webhooks (nunca polling) |
| Deploy | Vercel serverless (`vercel.json` con maxDuration) |
| Excel | SheetJS (xlsx) |

**Cadena de fallback de modelos** (`src/lib/gemma.ts`):
`google/gemma-4-31b-it:free` → `google/gemma-4-26b-a4b-it:free` →
`nvidia/nemotron-nano-12b-v2-vl:free`. El fallback se activa ante cualquier
error (429/404/timeout/5xx); solo 401/402 cortan de inmediato. Cada llamada
tiene presupuesto de 30 s (`AbortSignal.timeout`).

## 3. Arquitectura de rutas

```
/                       Landing pública
/login, /register       Auth (Supabase)
/dashboard              KPIs del período (protegida)
/documentos             Lista + upload + revisión/confirmación (protegida)
/reportes               Agrupado por cuenta PCGE (protegida)
/exportar               Descarga Excel (protegida)
/empresas               CRUD de empresas (protegida)
/config                 Vinculación Telegram (protegida)
/upload/[token]         Subida pública con token de 15 min (SIN auth)

/api/auth/*             login/logout/register
/api/empresas[/:id]     CRUD empresas
/api/documents/process  POST: upload + OCR Gemma 4 en tiempo real
/api/documents/confirm  PUT: confirmar/editar clasificación
/api/upload-token       POST: generar token de subida
/api/export/excel       GET: XLSX 3 hojas (OCR diferido para docs sin datos)
/api/telegram/webhook   POST: bot (GET registra el webhook)
/api/telegram/generate-token  POST: código de vinculación
```

**Middleware (`src/proxy.ts` — convención de Next.js 16):**
- Protege páginas: sin sesión → redirect `/login`; con sesión en `/login` → `/dashboard`.
- Idle timeout de 30 min (cookie `last_active`).
- **Excluye `/upload/*` y TODAS las `/api/*`**: las API responden JSON
  (401/403), nunca redirects HTML. *Lección aprendida: incluir las API en el
  matcher causaba 307 → /login y rompía la subida de documentos.*

## 4. Flujo principal: subida de documento

```
Usuario sube imagen (dashboard o /upload/[token])
  → POST /api/documents/process
     1. Auth: sesión Supabase O token de subida válido (no usado, no expirado)
     2. Validación: tipo (JPG/PNG/WebP/PDF), tamaño ≤ 5 MB
     3. Upload a Storage bucket "documentos" (privado)
     4. Si es imagen: extractInvoiceData (Gemma 4 OCR)
                    → classifyPCGE (Gemma 4 con rubro + régimen)
        Si la IA falla: guarda registro mínimo (degradación, nunca pierde el archivo)
        Si es PDF: registro mínimo (OCR diferido al exportar)
     5. INSERT en documentos con estado 'pendiente'
     6. Marca token como usado (si aplica)
     7. notifyContador → mensaje Telegram (best-effort)
  → Respuesta { documento, ocr: boolean, alerta }
  → UI: pantalla de revisión con datos extraídos + cuenta PCGE editable
  → Confirmar → PUT /api/documents/confirm → estado 'confirmado'
```

## 5. Bot de Telegram

Webhook con verificación de `x-telegram-bot-api-secret-token`.

| Entrada | Comportamiento |
|---------|---------------|
| Archivo/foto/audio | Rechazo educativo (regla de seguridad absoluta) |
| `/start` | Saludo o instrucciones de vinculación |
| `/start CODIGO` | Vincula `telegram_id` al perfil, invalida el código |
| `/empresa [nombre]` | Cambia empresa activa (o lista empresas) |
| `/ayuda`, `/help` | Mensaje de ayuda |
| "subir factura" (keywords) | Genera upload_token (15 min) + enlace |
| **Cualquier otro mensaje** | **Chat inteligente**: Gemma 4 responde con contexto de datos agregados (IGV, base, docs, vencimiento). Fallback a plantilla si la IA falla. |

**Vinculación (UX en /config):** botón "Conectar Telegram" → genera código
único (se reutiliza si ya existe) → deep link `t.me/<bot>?start=CODIGO` →
la página hace polling cada 4 s y pasa sola a "Conectado".

## 6. Modelo de datos

```sql
profiles   (id PK→auth.users, nombre, telegram_id UNIQUE, telegram_token)
empresas   (id PK, user_id FK, nombre, ruc(11), rubro, regimen, tipo_contrato)
documentos (id PK, empresa_id FK, tipo, storage_path, ruc_emisor, razon_social,
            fecha_emision, monto_base, igv, total, cuenta_pcge, nombre_cuenta,
            descripcion_ia, es_deducible, confianza_ia, estado, periodo)
upload_tokens (token PK, empresa_id FK, user_id FK, expires_at, usado)
```

`token` y `telegram_token` se generan en la app con `crypto` (no dependen de
DEFAULT en BD).

## 7. Seguridad (3 capas)

1. **Supabase Auth (JWT)** — identidad en cada request.
2. **Validación en API route** — `empresa_id` pertenece al usuario; tokens no
   usados ni expirados; status codes correctos.
3. **RLS** — política `user_id = auth.uid()` en empresas; documentos solo de
   empresas propias. Última línea de defensa.

**Reglas absolutas:**
- El bot NUNCA expone RUCs, razones sociales ni montos individuales (solo agregados).
- El bot NUNCA procesa archivos recibidos por Telegram.
- `SUPABASE_SERVICE_ROLE_KEY` solo en `src/lib/supabase/admin.ts` (server).
- Gemma 4 nunca se llama desde el frontend.
- El contexto del chat inteligente solo contiene totales agregados.

## 8. Variables de entorno

Ver `.env.example`. Críticas: `NEXT_PUBLIC_APP_URL` debe ser la URL real de
producción (`https://contaai-mu.vercel.app`) — el webhook de Telegram y los
enlaces de subida se generan con ella. `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
alimenta el botón "Abrir Telegram" en /config.

## 9. Decisiones de diseño relevantes

| Decisión | Razón |
|----------|-------|
| OCR en el upload (no diferido) | Es el flujo demo del concurso; UX inmediata |
| OCR diferido como respaldo en export | Re-procesa docs que fallaron (PDF, 429) |
| Chat LLM con contexto agregado | "Chat inteligente, no chatbot" sin exponer datos sensibles |
| Keywords solo para "subir" | Acción con efecto secundario (crea token); no debe depender del LLM |
| Webhook responde rápido y sin errores | Telegram reintenta en 5xx; siempre `{ok:true}` |
| `proxy.ts` excluye `/api` | APIs responden JSON, no redirects |
