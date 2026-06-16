const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Modelos multimodales gratuitos en orden de prioridad.
// Gemma 4 es el principal (requisito del concurso); los demás son fallback
// cuando el upstream está saturado (429) o el modelo no está disponible.
// Verificados contra el catálogo real de OpenRouter (jun 2026).
const VISION_MODELS = [
  process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',      // Gemma 4 26B — sigue siendo Gemma
  'nvidia/nemotron-nano-12b-v2-vl:free', // último recurso, visión confirmada
]

type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

async function callModel(
  model: string,
  messages: Message[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL!,
      'X-Title': 'ContaAI',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options?.maxTokens ?? 1000,
      temperature: options?.temperature ?? 0.1,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error ${response.status} [${model}]: ${err}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`Respuesta vacía del modelo [${model}]`)
  }
  return content
}

// Intenta con Gemma 4; ante CUALQUIER fallo (429, 404, timeout, 5xx) prueba
// el siguiente modelo de la lista. Solo 401/402 (credenciales/créditos) cortan
// de inmediato porque reintentar daría el mismo error.
async function callGemma4(
  messages: Message[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  let lastError: Error | null = null

  for (const model of VISION_MODELS) {
    try {
      const result = await callModel(model, messages, options)
      if (model !== VISION_MODELS[0]) {
        console.warn(`[gemma] Modelo principal no disponible, se usó fallback: ${model}`)
      }
      return result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (/API error 40[12]/.test(lastError.message)) throw lastError
      const is429 = lastError.message.includes('429')
      if (is429) await new Promise(r => setTimeout(r, 1000))
    }
  }

  throw lastError ?? new Error('Todos los modelos de IA fallaron')
}

// Parser robusto de JSON de Gemma 4
function parseJSON<T>(raw: string): T {
  const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) as T } catch {}
    }
    throw new Error(`No se pudo parsear JSON de Gemma 4: ${cleaned.slice(0, 200)}`)
  }
}

type InvoiceData = {
  tipo: 'factura' | 'boleta' | null
  serie_numero: string | null
  ruc_emisor: string | null
  razon_social: string | null
  fecha_emision: string | null   // YYYY-MM-DD
  monto_base: number | null
  igv: number | null
  total: number | null
  descripcion: string | null
}

export async function extractInvoiceData(
  imageBase64: string,
  mimeType = 'image/jpeg'
): Promise<InvoiceData> {
  const raw = await callGemma4([
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
        {
          type: 'text',
          text: `Eres un extractor especialista en comprobantes de pago peruanos (SUNAT).
Analiza la imagen con atención al detalle y extrae los datos del comprobante.

REGLAS ESTRICTAS por campo:
- "tipo": solo "factura" (si empieza con F o dice FACTURA) o "boleta" (si empieza con B o dice BOLETA). Null si no está claro.
- "serie_numero": formato "XXXX-NNNNNNNN" (ej: F001-00001234, B003-00000087). Null si no visible.
- "ruc_emisor": EXACTAMENTE 11 dígitos numéricos, sin espacios ni guiones. Null si no tiene 11 dígitos.
- "razon_social": nombre completo del emisor (quien emite el comprobante), no del cliente.
- "fecha_emision": las fechas en Perú usan DD/MM/YYYY → convierte a YYYY-MM-DD. Ej: 15/03/2026 → 2026-03-15.
- "monto_base": valor numérico de la base imponible (sin IGV). Decimal con punto. Null si no visible.
- "igv": valor numérico del IGV (18%). Decimal con punto. Null si no visible.
- "total": valor total a pagar. Debe ser aprox monto_base + igv. Decimal con punto. Null si no visible.
- "descripcion": descripción concisa de los bienes o servicios comprados (máx 120 caracteres).

Si un campo no está visible o no puedes determinarlo con certeza, usa null.
Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown ni bloques de código.

{
  "tipo": "factura o boleta o null",
  "serie_numero": "string o null",
  "ruc_emisor": "string 11 dígitos o null",
  "razon_social": "string o null",
  "fecha_emision": "YYYY-MM-DD o null",
  "monto_base": número o null,
  "igv": número o null,
  "total": número o null,
  "descripcion": "string o null"
}`,
        },
      ],
    },
  ])

  return parseJSON<InvoiceData>(raw)
}

type PCGEClassificationRaw = {
  cuenta_pcge: string
  nombre_cuenta: string
  es_deducible: boolean
  razon: string
  confianza: number
  alerta: string | null
}

// Cuentas PCGE más comunes para orientar la clasificación contextual.
// Esta lista ayuda al modelo a elegir el código correcto en casos frecuentes.
const PCGE_EJEMPLOS = `
Cuentas PCGE más comunes en compras de empresas peruanas:
60.1 Mercaderías — compra de mercancías para reventa (comercio)
60.2 Materias primas — insumos para producción (manufactura)
60.3 Materiales auxiliares, suministros y repuestos
60.5 Envases y embalajes
63.1 Transporte, correos y gastos de viaje
63.2 Asesoría y consultoría
63.3 Producción encargada a terceros
63.4 Mantenimiento y reparaciones
63.5 Servicios públicos (agua, luz, teléfono, internet)
63.6 Seguros y provisiones
63.7 Publicidad, publicaciones y relaciones públicas
63.9 Otros servicios prestados por terceros
64.1 Suministros (útiles de oficina, combustibles, materiales de limpieza)
65.1 Seguros
65.6 Suscripciones
33.3 Equipos de cómputo (activo fijo si valor > 1/4 UIT ≈ S/1,275)
33.4 Equipos de transporte (activo fijo)
33.5 Muebles y enseres (activo fijo)
33.6 Equipos diversos (activo fijo)`

export async function classifyPCGE(
  descripcion: string,
  rubro: string,
  regimen: string
): Promise<PCGEClassificationRaw> {
  const raw = await callGemma4(
    [
      {
        role: 'system',
        content: `Eres un experto contador peruano certificado, especialista en el Plan Contable General Empresarial (PCGE) y legislación SUNAT.
La empresa que registra esta compra pertenece al rubro: ${rubro}.
Régimen tributario: ${regimen}.

${PCGE_EJEMPLOS}

CRITERIOS DE DEDUCIBILIDAD (Impuesto a la Renta):
- Deducible: gastos necesarios para producir renta o mantener la fuente (principio de causalidad).
- NO deducible: gastos personales, multas, donaciones (salvo casos especiales), gastos sin sustento.
- Regímenes RUS/NRUS no deducen gastos (tasa fija). Para RMT/RER/RG aplicar criterio normal.

Tu trabajo: clasificar el gasto en la cuenta PCGE correcta según rubro y régimen, y determinar si es deducible.
Responde ÚNICAMENTE con JSON válido, sin texto adicional.`,
      },
      {
        role: 'user',
        content: `Descripción del comprobante de compra: "${descripcion}"

Clasifica este gasto considerando que la empresa es del rubro "${rubro}" y está en el régimen "${regimen}".
Responde:
{
  "cuenta_pcge": "código exacto (ej: 63.5)",
  "nombre_cuenta": "nombre oficial de la cuenta PCGE",
  "es_deducible": true o false,
  "razon": "justificación breve en español (máx 100 caracteres)",
  "confianza": 0.0 a 1.0,
  "alerta": "advertencia relevante si existe, o null"
}`,
      },
    ],
    { maxTokens: 400, temperature: 0.05 }
  )

  try {
    return parseJSON<PCGEClassificationRaw>(raw)
  } catch {
    return {
      cuenta_pcge: '60.9',
      nombre_cuenta: 'Otras compras',
      es_deducible: false,
      razon: 'No se pudo clasificar automáticamente',
      confianza: 0.3,
      alerta: 'Requiere revisión manual del contador',
    }
  }
}

type BotIntent = 'upload' | 'query_igv' | 'query_vencimiento' | 'query_facturas' | 'unknown'

function detectIntentByKeywords(text: string): BotIntent | null {
  const t = text.toLowerCase()
  if (/subir|upload|enviar.*(factura|boleta|foto|imagen)|adjunt|link|enlace/.test(t))
    return 'upload'
  return null
}

export async function classifyIntent(message: string): Promise<BotIntent> {
  // Solo "upload" se detecta por keywords (acción con efecto secundario:
  // genera un token). El resto de mensajes va al chat inteligente.
  const kwIntent = detectIntentByKeywords(message)
  if (kwIntent) return kwIntent
  return 'unknown'
}

// ─────────────────────────────────────────────
// Chat inteligente del bot de Telegram
// ─────────────────────────────────────────────

export type ChatContext = {
  contadorNombre: string | null
  empresaNombre: string
  empresas: string[]
  periodo: string
  totalIGV: number
  totalBase: number
  totalDocs: number
  confirmados: number
  pendientes: number
  vencimientoFecha: string
  vencimientoDias: number
}

/**
 * Responde un mensaje del contador en lenguaje natural usando Gemma 4,
 * con los datos agregados reales del período como contexto.
 * REGLA DE SEGURIDAD: el contexto solo contiene totales agregados —
 * nunca RUCs, razones sociales ni montos individuales.
 */
export async function chatContador(
  userMessage: string,
  ctx: ChatContext
): Promise<string> {
  const regimenHint = `Recuerda: en Perú existen 4 regímenes: NRUS (cuota fija), RER (1.5% ventas),
RMT (10%/29.5% renta) y RG (régimen general, 29.5%). El IGV es 18% para facturas.
El PCGE peruano clasifica gastos: cuentas 60.x (compras), 63.x (servicios), 33.x (activos fijos), etc.`

  const raw = await callGemma4(
    [
      {
        role: 'system',
        content: `Eres el asistente contable de ContaAI en Telegram. Hablas con ${ctx.contadorNombre ?? 'un contador'} sobre la empresa "${ctx.empresaNombre}" (Perú).

DATOS REALES del período ${ctx.periodo} (usa SOLO estos datos, nunca inventes cifras):
- IGV acumulado: S/ ${ctx.totalIGV.toFixed(2)}
- Base imponible: S/ ${ctx.totalBase.toFixed(2)}
- Total gastos: S/ ${(ctx.totalBase + ctx.totalIGV).toFixed(2)}
- Documentos: ${ctx.totalDocs} (${ctx.confirmados} confirmados, ${ctx.pendientes} por revisar)
- Próxima declaración SUNAT (referencial): ${ctx.vencimientoFecha} (${ctx.vencimientoDias >= 0 ? `faltan ${ctx.vencimientoDias} días` : `venció hace ${Math.abs(ctx.vencimientoDias)} días`}; la fecha exacta depende del último dígito del RUC)
- Empresas del contador: ${ctx.empresas.join(', ')}

${regimenHint}

ACCIONES DISPONIBLES (menciona solo si es relevante al mensaje del usuario):
- Subir factura/boleta: escribe "subir factura" para recibir un enlace seguro de 15 minutos.
- Cambiar empresa activa: /empresa [nombre parcial del nombre]
- Ver cuenta vinculada: /cuenta · Cerrar sesión bot: /cerrar
- Ver dashboard completo: ${process.env.NEXT_PUBLIC_APP_URL}

REGLAS ESTRICTAS:
1. NUNCA reveles ni menciones RUCs de proveedores, razones sociales individuales ni montos de documentos específicos. Solo agregados.
2. Si el usuario pregunta algo contable general (IGV, PCGE, regímenes, SUNAT, declaraciones), responde como experto contador peruano.
3. Si no puedes responder con certeza, di "No tengo esa información, pero puedes verlo en el dashboard."
4. Responde en español, máximo 6 líneas, tono cercano pero profesional.
5. Formato Telegram: usa solo <b>texto</b> para negritas y <code>texto</code> para códigos/números. Sin markdown, sin asteriscos, sin otras etiquetas HTML.
6. Si hay documentos pendientes de revisar y el vencimiento está próximo (≤5 días), menciónalo proactivamente.`,
      },
      { role: 'user', content: userMessage },
    ],
    { maxTokens: 400, temperature: 0.35 }
  )
  return raw.trim()
}

// Wrapper con retry para rate limits de OpenRouter free tier
export async function callGemma4WithRetry(
  messages: Message[],
  options?: { maxTokens?: number; temperature?: number },
  retries = 1
): Promise<string> {
  try {
    return await callGemma4(messages, options)
  } catch (error: unknown) {
    if (retries > 0 && error instanceof Error && error.message.includes('429')) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      return callGemma4WithRetry(messages, options, retries - 1)
    }
    throw error
  }
}
