# PENDIENTES — Qué falta terminar
## ContaAI — Roadmap priorizado

**Última actualización:** 10 junio 2026 (post-refactor de esta sesión)

---

## ✅ Resuelto en esta sesión (10 jun 2026)

| # | Cambio | Archivo(s) |
|---|--------|-----------|
| 1 | **Fix subida de imágenes**: el proxy interceptaba `/api/documents/process` con 307 → /login. Ahora todas las `/api/*` quedan fuera del matcher | `src/proxy.ts` |
| 2 | **Fix fallback de modelos**: `llama-4-scout/maverick:free` ya no existen en OpenRouter. Nueva cadena: gemma-4-31b → gemma-4-26b → nemotron-nano-12b-v2-vl, con fallback ante cualquier error y timeout de 30s por modelo | `src/lib/gemma.ts` |
| 3 | **OCR en tiempo real**: Gemma 4 extrae y clasifica al subir (antes solo al exportar). Degradación elegante si la IA falla | `api/documents/process/route.ts` |
| 4 | **UI de revisión post-upload**: datos extraídos, cuenta PCGE editable, % confianza, confirmar | `components/upload-zone.tsx` |
| 5 | **Chat inteligente en el bot**: Gemma 4 conversa con contexto de datos agregados; plantilla como fallback; typing indicator | `api/telegram/webhook/route.ts` |
| 6 | **Notificación Telegram al contador** conectada (notify.ts ya no es código muerto) | `api/documents/process/route.ts` |
| 7 | **/config rediseñada**: badge Conectado/No conectado, un solo código reutilizable, deep link t.me, auto-detección por polling | `config/page.tsx`, `api/telegram/generate-token/route.ts` |
| 8 | **Responsive completo**: sidebar móvil (Sheet + hamburguesa), headers apilados, grids adaptados, tablas con scroll | layout, header, todas las páginas |
| 9 | window.confirm → AlertDialog accesible | `empresas/page.tsx` |
| 10 | Toasts (sonner) en CRUD + Toaster global | `app/layout.tsx`, empresas, documentos |
| 11 | Fix "null docs" en /exportar | `exportar/page.tsx` |
| 12 | router.refresh() tras CRUD de empresas (switcher al día) | `empresas/page.tsx` |
| 13 | Código de vinculación criptográfico + sin códigos duplicados | `generate-token/route.ts` |
| 14 | Diálogo de detalle/confirmación por fila en /documentos | `documentos/page.tsx` |
| 15 | `.env` local corregido (APP_URL apuntaba a otro proyecto Vercel) + `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | `.env`, `.env.example` |

## 🔴 Acciones requeridas del dueño del proyecto (no son código)

1. **Verificar variables de entorno en Vercel** (Settings → Environment Variables):
   - `NEXT_PUBLIC_APP_URL` = `https://contaai-mu.vercel.app` (¡no `contaai.vercel.app`, ese es otro proyecto!)
   - Agregar `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` = `contaAI_gemma_bot`
   - Confirmar que `OPENROUTER_API_KEY`, `TELEGRAM_*` y `SUPABASE_*` están completos.
2. **Commitear `vercel.json`** (está untracked): sin él, las functions de Vercel
   usan el timeout por defecto y el OCR en upload (hasta ~60s) fallará.
3. **Re-deploy** y luego `GET /api/telegram/webhook` una vez para re-registrar el webhook.
4. Considerar **key propia de Google AI Studio** en OpenRouter (Settings →
   Integrations) para reducir los 429 de los modelos Gemma free.

## 🟡 Siguiente iteración (mejoras de producto)

| Prioridad | Item | Estimado |
|-----------|------|----------|
| Alta | Ver imagen del comprobante en el diálogo de detalle (signed URL de Storage) | 1 h |
| Alta | DELETE de documento (API + botón con AlertDialog) | 45 min |
| Alta | Memoria de conversación del bot (últimos N mensajes en una tabla `chat_history`) para contexto multi-turno real | 2 h |
| Media | Persistir la "empresa activa" del bot por usuario (hoy vuelve a empresas[0] en cada mensaje) | 45 min |
| Media | Procesar PDFs en el upload (convertir 1ª página a imagen o esperar soporte file en OpenRouter) | 2 h |
| Media | Paginación en /documentos (hoy trae todo el período) | 1 h |
| Media | Cambio de contraseña y edición de nombre en /config | 1 h |
| Baja | Comparativa multi-período en /reportes | 2 h |
| Baja | Modo oscuro (next-themes ya instalado) | 1 h |
| Baja | Rate limiting propio en API routes (hoy protege solo Supabase/Vercel) | 1 h |

## 🟠 Deuda técnica conocida

- **12 errores de lint `react-hooks/set-state-in-effect`** (pre-existentes): el
  patrón "leer localStorage en useEffect + setState" se repite en todas las
  páginas del dashboard y en `use-empresa-activa.ts`. No bloquean el build.
  Fix correcto: migrar la empresa activa a un Context/`useSyncExternalStore`
  en lugar de localStorage + CustomEvent. Estimado: 2 h.
- El bot no tiene memoria de conversación entre mensajes (cada mensaje es
  independiente; el contexto son los datos agregados del período).

## 🧪 Deuda de testing (ver TDD.md)

- Instalar vitest + tests unitarios de `gemma.ts` (parseJSON, fallback) — prioridad 1.
- Playwright E2E del flujo completo de upload — prioridad 2.
- CI con `tsc --noEmit` + `next build` + tests en cada push — prioridad 3.

## 📋 Para el post del concurso (DEV.to, deadline 24 may 2026 — ya pasado, verificar nueva fecha)

Orden de demo sugerido:
1. Subir factura → "Gemma 4 analizando..." → datos extraídos → confirmar.
2. Preguntar al bot "¿cuánto IGV llevo?" en lenguaje natural.
3. "subir factura" al bot → enlace 15 min → subir desde el móvil → notificación.
4. Exportar Excel de 3 hojas.

Puntos técnicos a destacar: visión multimodal real (base64 → JSON de 9 campos),
clasificación contextual por rubro/régimen, fallback multi-modelo transparente,
chat con contexto agregado sin exponer datos sensibles.
