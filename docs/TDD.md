# TDD — Test Driven Development
## ContaAI — Plan de pruebas y estado actual

**Versión:** 2.0 · **Última actualización:** 10 junio 2026

---

## 1. Estado actual

El proyecto **no tiene framework de tests instalado** (sin vitest/jest ni
Playwright). La verificación se hace hoy con:

| Verificación | Comando | Estado |
|---------------|---------|--------|
| Tipos TypeScript (strict) | `npx tsc --noEmit` | ✅ se ejecuta en cada cambio |
| Build de producción | `npm run build` | ✅ se ejecuta en cada cambio |
| Lint | `npm run lint` | ✅ |
| Pruebas de API en vivo | scripts manuales (curl / Invoke-RestMethod) | ✅ auditoría jun 2026 |
| QA visual | navegación manual + auditoría con navegador | parcial |

## 2. Framework recomendado (siguiente paso)

```bash
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react
npm i -D playwright @playwright/test        # E2E
```

Estructura propuesta:

```
src/
├── lib/
│   ├── gemma.ts
│   ├── gemma.test.ts        ← unit: parseJSON, fallback, intents
│   ├── pcge.ts
│   └── pcge.test.ts         ← unit: catálogo válido, códigos únicos
e2e/
├── auth.spec.ts             ← login/logout/protección de rutas
├── upload.spec.ts           ← subida + OCR + confirmación
├── upload-token.spec.ts     ← flujo público con token
└── config-telegram.spec.ts  ← vinculación
```

## 3. Matriz de pruebas unitarias (prioridad alta)

### `lib/gemma.ts`
| # | Caso | Tipo |
|---|------|------|
| U1 | `parseJSON` con JSON limpio | unit |
| U2 | `parseJSON` con fences ```json | unit |
| U3 | `parseJSON` con texto alrededor del objeto | unit |
| U4 | `parseJSON` lanza con basura total | unit |
| U5 | `callGemma4` hace fallback al 2º modelo en 429 | unit (fetch mock) |
| U6 | `callGemma4` hace fallback en 404 (modelo retirado) | unit (fetch mock) |
| U7 | `callGemma4` NO reintenta en 401/402 | unit (fetch mock) |
| U8 | `classifyIntent("subir factura")` → 'upload' sin llamar al LLM | unit |
| U9 | `classifyPCGE` retorna cuenta 60.9 si el JSON es inválido | unit |
| U10 | `chatContador` nunca incluye RUCs en el system prompt | unit |

### API routes (integration, con Supabase de test)
| # | Caso | Esperado |
|---|------|----------|
| I1 | POST /api/documents/process sin auth ni token | 401 JSON (no 307) |
| I2 | POST con token expirado | 403 "Token inválido o expirado" |
| I3 | POST con token usado | 403 |
| I4 | POST con archivo > 5MB | 400 |
| I5 | POST con .exe | 400 "Formato no permitido" |
| I6 | POST válido con OCR caído | 200, documento con campos IA null, ocr:false |
| I7 | PUT /api/documents/confirm de doc ajeno | 404/403 |
| I8 | POST /api/telegram/webhook sin secret | 401 |
| I9 | POST /api/telegram/generate-token dos veces | mismo código (reused:true) |
| I10 | POST /api/upload-token de empresa ajena | 403 |

### E2E (Playwright)
| # | Flujo |
|---|-------|
| E1 | Registro → crear empresa → subir factura → revisar OCR → confirmar → ver en reportes → exportar |
| E2 | Bot: generar código → /start CODE → "¿cuánto IGV llevo?" → respuesta con datos |
| E3 | Bot: "subir factura" → abrir link → subir → notificación al contador |
| E4 | Aislamiento: usuario B no ve datos de usuario A |
| E5 | Móvil 375px: navegación completa con hamburguesa |

## 4. Resultados de la auditoría en vivo (10 junio 2026)

Pruebas ejecutadas contra servicios reales durante esta sesión:

| Prueba | Resultado |
|--------|-----------|
| Telegram `getMe` | ✅ @contaAI_gemma_bot activo |
| Telegram `getWebhookInfo` | ✅ registrado a contaai-mu.vercel.app, 0 errores |
| OpenRouter texto `gemma-4-31b-it:free` | ✅ responde |
| OpenRouter visión `gemma-4-31b-it:free` | ⚠️ 429 rate-limited upstream (intermitente) |
| OpenRouter visión `gemma-4-26b-a4b-it:free` | ⚠️ 429 rate-limited upstream (intermitente) |
| OpenRouter visión `nemotron-nano-12b-v2-vl:free` | ✅ responde |
| Modelos `llama-4-scout/maverick:free` | ❌ **RETIRADOS de OpenRouter** (causaban fallo del fallback) |
| Supabase Storage upload (service role) | ✅ |
| Supabase INSERT documentos | ✅ |
| POST /api/documents/process producción (token válido) | ❌ **307 → /login** (bug del matcher del proxy, corregido en código) |

**Conclusiones que motivaron fixes:**
1. El matcher del proxy interceptaba `/api/documents/*` → corregido excluyendo `/api`.
2. La cadena de fallback tenía 2 modelos inexistentes → actualizada con modelos verificados.
3. El fallback solo se activaba en 429 → ahora ante cualquier error recuperable.

## 5. Cómo correr la verificación hoy

```bash
npx tsc --noEmit       # 0 errores esperados
npm run build          # build limpio esperado
npm run dev            # smoke test manual en localhost:3000
```

Smoke test mínimo tras cada deploy:
1. `GET https://<app>/api/telegram/webhook` → re-registra el webhook.
2. Login → subir una imagen de factura → ver datos extraídos → confirmar.
3. Enviar "hola, ¿cómo voy este mes?" al bot → respuesta con datos.
4. Escribir "subir factura" al bot → abrir el enlace → subir desde el móvil.
