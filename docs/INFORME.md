# INFORME EJECUTIVO — ContaAI
## Asistente Contable Inteligente para contadores y MYPEs del Perú

**Fecha del informe:** 11 de junio de 2026
**Versión del producto:** 2.0 (post-auditoría y refactor mayor)
**Producción:** https://contaai-mu.vercel.app · Bot: @contaAI_gemma_bot
**Contexto:** Proyecto construido para el Gemma 4 Challenge (DEV.to / Major League Hacking), categoría *Build With Gemma 4*

---

## 1. Resumen ejecutivo

ContaAI es una plataforma web + bot de Telegram que **automatiza la parte más
repetitiva y propensa a errores del trabajo contable peruano: leer comprobantes
de pago y clasificarlos en el Plan Contable General Empresarial (PCGE)**.

El contador (o el dueño de la MYPE) sube la foto de una factura o boleta y, en
~12 segundos, **Gemma 4** extrae todos los datos (RUC, emisor, fecha, base
imponible, IGV, total), clasifica el gasto en la cuenta PCGE correcta según el
rubro y régimen tributario de la empresa, determina si es deducible y asigna un
porcentaje de confianza. El contador solo revisa y confirma. Al final del mes,
descarga el Registro de Compras en Excel listo para su declaración a SUNAT.

La IA no es un accesorio: es el motor de las tres capacidades centrales del
producto (visión OCR, clasificación contable contextual y chat conversacional),
con una cadena de respaldo multi-modelo que mantiene el servicio operativo
incluso cuando el modelo principal está saturado.

---

## 2. El problema que resuelve

### 2.1 La realidad del contador MYPE en el Perú

En el Perú existen más de 2 millones de micro y pequeñas empresas. La gran
mayoría no tiene contador interno: contrata a un **contador independiente que
lleva entre 10 y 50 empresas a la vez**, cobrando una tarifa mensual baja por
cada una. El flujo de trabajo típico es:

1. El cliente junta facturas y boletas físicas o fotos sueltas por WhatsApp.
2. El contador digita a mano cada comprobante: RUC del emisor, fecha, base, IGV, total.
3. Decide para cada gasto la **cuenta PCGE** correcta (60.1 Mercaderías,
   63.5 Servicios públicos, 33.3 Equipos de cómputo, etc.) — una decisión que
   depende del **rubro** de la empresa y de su **régimen tributario**
   (RMT, RER, RG o NRUS).
4. Evalúa si el gasto es **deducible** para el Impuesto a la Renta.
5. Consolida todo en el Registro de Compras y declara mensualmente a SUNAT,
   con fecha límite según el último dígito del RUC.

### 2.2 Los dolores concretos

| Dolor | Consecuencia |
|-------|-------------|
| Digitación manual de cada comprobante | 3–5 min por documento; cientos al mes |
| Clasificación PCGE inconsistente | Mismo gasto en cuentas distintas según el día/asistente |
| Comprobantes que llegan tarde o se pierden | Registros incompletos, rectificatorias |
| El cliente envía fotos por WhatsApp sin estructura | El contador hace de "buzón humano" |
| Cero trazabilidad de qué falta revisar | Maratones de cierre los días previos al vencimiento |
| Errores de deducibilidad | Multas o crédito fiscal perdido |

ContaAI ataca exactamente esa cadena: captura → extracción → clasificación →
revisión → reporte, dejando al humano solo el paso de criterio profesional
(revisar y confirmar).

---

## 3. Qué es ContaAI y para qué sirve al contador

### 3.1 Para el contador (usuario principal)

- **Multi-empresa real:** gestiona todas sus empresas cliente desde una cuenta,
  con aislamiento total de datos entre empresas y entre contadores.
- **Subida con análisis inmediato:** arrastra la foto del comprobante y ve en
  pantalla los datos extraídos, la cuenta PCGE sugerida, el flag de deducible y
  la confianza de la IA. Confirma o corrige con un selector — nada de digitar.
- **Cola de revisión:** todo documento entra como "pendiente" hasta que el
  contador lo confirma. El dashboard muestra confirmados vs pendientes y alerta
  cuando el vencimiento SUNAT está a ≤5 días.
- **Asistente en el bolsillo:** desde Telegram pregunta en lenguaje natural
  *"¿cuánto IGV llevo este mes en la ferretería?"* y recibe los números reales
  del período. También resuelve dudas contables generales (cuentas PCGE,
  regímenes) como un colega experto.
- **Recolección sin fricción:** escribe "subir factura" al bot y recibe un
  **enlace seguro de 15 minutos** que puede reenviar a su cliente; el cliente
  sube la foto desde su celular **sin crear cuenta ni instalar nada**, y el
  contador recibe la notificación con la clasificación ya hecha.
- **Cierre de mes en un clic:** exporta el Registro de Compras en Excel
  (3 hojas: registro detallado, resumen por cuenta PCGE, información del
  período) listo para su software de declaración.

### 3.2 Para la MYPE (cliente del contador)

- No cambia sus hábitos: una foto desde el celular y listo.
- Visibilidad: su contador puede decirle en cualquier momento cuánto IGV
  acumula y cuántos documentos tiene registrados.
- Menos riesgo de multas por comprobantes perdidos o mal clasificados.

### 3.3 Ahorro estimado

Con extracción y clasificación automáticas, el tiempo por comprobante baja de
~3–5 minutos (digitar + clasificar) a ~10–20 segundos (revisar + confirmar).
Para un contador con 20 empresas y ~40 comprobantes/empresa/mes, son
**~50–60 horas de digitación al mes convertidas en ~4 horas de revisión.**

---

## 4. Lo innovador

### 4.1 Gemma 4 como núcleo, en tres roles distintos

1. **Visión multimodal real (OCR estructurado):** la imagen del comprobante se
   envía a Gemma 4 y regresa un JSON de 9 campos tipados (tipo, serie, RUC,
   razón social, fecha, base, IGV, total, descripción). No es OCR de texto
   plano + regex: el modelo entiende el layout del comprobante peruano,
   incluyendo el formato de fecha DD/MM/YYYY.

2. **Clasificación contable contextual:** la misma compra se clasifica
   diferente según el contexto. Cemento para una **ferretería** es mercadería
   (60.1); para una **constructora** es material de obra. El prompt incluye el
   rubro y el régimen tributario de la empresa, y el modelo devuelve cuenta,
   deducibilidad, razón, confianza y alertas. Esto es lo que un sistema de
   reglas fijas no puede hacer sin mantener miles de casos.

3. **Chat inteligente con seguridad por diseño:** el bot no es un árbol de
   comandos. Cada mensaje libre se responde con Gemma 4 usando como contexto
   **solo los agregados del período** (totales de IGV, base, conteos,
   vencimiento). El modelo nunca recibe RUCs de proveedores ni montos
   individuales, así que **es matemáticamente imposible que los filtre** —
   la privacidad no depende del buen comportamiento del LLM sino de qué datos
   se le entregan.

### 4.2 Resiliencia multi-modelo (verificada en producción)

Los modelos gratuitos se saturan (HTTP 429). ContaAI implementa una cadena de
respaldo verificada contra el catálogo real de OpenRouter:
`gemma-4-31b` → `gemma-4-26b` → `nemotron-nano-12b-vl`, con timeout de 30 s
por modelo y fallback ante cualquier error recuperable. Si toda la cadena
falla, **el documento se guarda igual** y se procesa en diferido al exportar:
el usuario nunca pierde su archivo por una falla de IA.

### 4.3 El enlace efímero de subida

El problema "mi cliente me manda fotos por WhatsApp" se resuelve con un patrón
poco común en este segmento: **tokens de un solo uso con expiración de 15
minutos**, generados desde el bot o el dashboard. El cliente externo no
necesita cuenta, la página pública muestra cuenta regresiva en vivo, y el token
muere al usarse. Seguridad y cero fricción a la vez.

### 4.4 Identidad y sesión en Telegram

Cada usuario se distingue por su `chat_id` único de Telegram (no falsificable).
La vinculación usa códigos criptográficos de un solo uso con deep link de un
toque; `/cuenta` valida la identidad (email enmascarado), `/cerrar` termina la
sesión desde el chat, y vincular una segunda cuenta desde el mismo Telegram
cierra la anterior automáticamente con aviso. Un Telegram ↔ una cuenta a la vez.

---

## 5. Estado actual (verificado en auditoría del 10–11 jun 2026)

| Capacidad | Estado | Evidencia |
|-----------|--------|-----------|
| Registro/login/logout + protección de rutas + idle timeout 30 min | ✅ | QA en vivo |
| CRUD multi-empresa con aislamiento RLS | ✅ | QA con 2 usuarios |
| Upload + OCR + clasificación en tiempo real | ✅ | E2E producción: factura procesada en 12.4 s, datos exactos, cuenta 60.1, confianza 1.0 |
| UI de revisión y confirmación (upload y por fila) | ✅ | Local |
| Degradación elegante si la IA falla | ✅ | Probado con modelos saturados |
| Bot: chat inteligente con datos reales | ✅ | Respuesta en 8.4 s al Telegram real |
| Bot: enlace de subida 15 min | ✅ | E2E producción |
| Bot: /cuenta, /cerrar, cambio de cuenta seguro | ✅ | Probado en producción |
| Notificación Telegram al contador por documento procesado | ✅ | Recibida en pruebas |
| Reportes por cuenta PCGE + export Excel 3 hojas | ✅ | QA en vivo |
| Responsive completo (menú móvil, tablas, grids) | ✅ | Build verificado |
| Vinculación Telegram con deep link y autodetección | ✅ | Producción |

**Calidad técnica:** TypeScript strict 0 errores · build limpio (21 rutas) ·
3 capas de seguridad (JWT → validación API → RLS) · documentación SDD/BDD/TDD.

---

## 6. Escalabilidad

### 6.1 Técnica (arquitectura actual)

- **Serverless por diseño:** Vercel escala cada API route horizontalmente sin
  servidores que administrar; el webhook del bot soporta ráfagas de usuarios
  concurrentes de forma nativa.
- **Multi-tenant desde el día uno:** el aislamiento no es por aplicación sino
  por fila (RLS de PostgreSQL) + validación en API. Agregar el contador #1.000
  no requiere ningún cambio: es una fila más en `profiles`.
- **Supabase (PostgreSQL):** crecimiento vertical sencillo (plan superior) y
  Storage con CDN para los archivos. Los buckets son privados.
- **Webhooks, no polling:** el bot no consume recursos en reposo; costo
  marginal por usuario inactivo ≈ 0.
- **IA stateless:** cada llamada a OpenRouter es independiente; escalar
  usuarios = escalar requests, sin estado compartido que sincronizar.

### 6.2 Cuellos de botella conocidos y su camino de solución

| Límite actual | Cuándo aparece | Solución |
|---------------|----------------|----------|
| Cuota de modelos `:free` (429) | Decenas de OCR/hora | Key propia de Google AI Studio (BYOK, ya documentado) o tier pago — el código no cambia |
| maxDuration 60 s en Vercel | Lotes muy grandes en export | Cola asíncrona (p. ej. procesar al subir siempre, export solo lee) — ya mitigado con OCR en tiempo real |
| Agregación de reportes en cliente | Miles de docs por período | Mover a vistas SQL / RPC de Supabase |
| Sin paginación en /documentos | Cientos de docs por período | Paginación con `range()` |
| Bot sin memoria multi-turno | Conversaciones largas | Tabla `chat_history` con últimos N mensajes |

### 6.3 De negocio

- **Costo marginal bajísimo:** el stack actual (Vercel hobby + Supabase free +
  modelos free) cuesta $0; con 100–500 contadores activos, el salto es a
  ~$45–70/mes (Vercel Pro + Supabase Pro + créditos de IA) — viable incluso
  con un plan de S/ 30–50/mes por contador.
- **Expansión natural del producto:** ventas (no solo compras), conciliación
  bancaria, PLE/SIRE de SUNAT, facturación electrónica — todos consumen la
  misma base: documento → extracción → clasificación → reporte.
- **Expansión geográfica:** la lógica "plan contable + régimen + impuesto" se
  replica para otros países de la región (Chile/Colombia/México) cambiando
  catálogo PCGE, tasa de impuesto y prompts — el motor es el mismo.

---

## 7. Seguridad y privacidad (resumen)

- 3 capas: Supabase Auth (JWT) → validación de pertenencia en cada API route →
  Row Level Security en PostgreSQL como última línea.
- El bot **nunca** expone RUCs, razones sociales ni montos individuales; solo
  agregados. **Nunca** acepta archivos por Telegram (los redirige al enlace
  seguro).
- Tokens de subida: un solo uso, 15 minutos, UUID criptográfico.
- Códigos de vinculación: `crypto.getRandomValues`, un solo uso, alfabeto sin
  caracteres ambiguos.
- `service_role_key` solo en servidor; la IA solo se llama desde el backend.
- Sesión web con timeout por inactividad (30 min).

---

## 8. Conclusión

ContaAI no es "un wrapper de IA": es un flujo contable completo donde Gemma 4
hace el trabajo que hoy consume la mayor parte de la jornada del contador MYPE
peruano, con decisiones de arquitectura (fallback multi-modelo, degradación
elegante, contexto agregado, tokens efímeros, RLS multi-tenant) que lo hacen
operable en el mundo real y escalable sin reescritura.

**Posición frente a los criterios del Gemma 4 Challenge:**

| Criterio | Cómo se cumple |
|----------|----------------|
| Uso intencional y efectivo de Gemma 4 | 3 roles distintos y visibles: OCR en vivo, clasificación contextual, chat — todos verificados en producción |
| Implementación técnica | TS strict, 3 capas de seguridad, resiliencia multi-modelo, docs SDD/BDD/TDD |
| Creatividad y originalidad | Dominio hiper-específico (PCGE/SUNAT), enlace efímero, privacidad por diseño del chat |
| Usabilidad y UX | Revisar-y-confirmar en vez de digitar, bot en lenguaje natural, responsive móvil, vinculación de un toque |

**Próximos pasos recomendados** (detalle en `docs/PENDIENTES.md`): key propia
de Google AI Studio, memoria de conversación del bot, vista de imagen del
comprobante, tests automatizados, y la publicación del post en DEV.to con la
demo en video.
