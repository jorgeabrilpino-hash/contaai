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
    // Presupuesto por modelo: en serverless (60s máx) no podemos esperar
    // indefinidamente a un upstream colgado antes de probar el siguiente.
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
          text: `Eres un extractor de comprobantes de pago peruanos (SUNAT).
Analiza esta imagen y extrae los datos.
Si un campo no está visible o no existe, usa null.
IMPORTANTE: las fechas en comprobantes peruanos usan formato DD/MM/YYYY
(día/mes/año) — conviértelas correctamente a YYYY-MM-DD.
Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown.

{
  "tipo": "factura o boleta",
  "serie_numero": "ej: F001-00001234",
  "ruc_emisor": "11 dígitos exactos",
  "razon_social": "nombre del emisor",
  "fecha_emision": "YYYY-MM-DD",
  "monto_base": número decimal,
  "igv": número decimal,
  "total": número decimal,
  "descripcion": "descripción de bienes o servicios comprados"
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

export async function classifyPCGE(
  descripcion: string,
  rubro: string,
  regimen: string
): Promise<PCGEClassificationRaw> {
  const raw = await callGemma4(
    [
      {
        role: 'system',
        content: `Eres un experto contador peruano especialista en el Plan Contable
General Empresarial (PCGE). La empresa es del rubro: ${rubro}.
Régimen tributario: ${regimen}.
Tu trabajo es clasificar gastos de compras en la cuenta PCGE correcta
y determinar si son deducibles para impuesto a la renta.
Responde ÚNICAMENTE con JSON válido, sin texto adicional.`,
      },
      {
        role: 'user',
        content: `Descripción del comprobante de compra: "${descripcion}"

Clasifica este gasto y responde:
{
  "cuenta_pcge": "XX.X (código exacto del PCGE)",
  "nombre_cuenta": "nombre oficial de la cuenta",
  "es_deducible": true o false,
  "razon": "explicación breve en español (máx 100 caracteres)",
  "confianza": 0.0 a 1.0,
  "alerta": "advertencia si existe, o null"
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
  const raw = await callGemma4(
    [
      {
        role: 'system',
        content: `Eres el asistente contable de ContaAI en Telegram. Hablas con ${ctx.contadorNombre ?? 'un contador'} sobre la empresa "${ctx.empresaNombre}" (Perú).

DATOS REALES del período ${ctx.periodo} (única fuente de verdad, NO inventes cifras):
- IGV acumulado: S/ ${ctx.totalIGV.toFixed(2)}
- Base imponible: S/ ${ctx.totalBase.toFixed(2)}
- Documentos: ${ctx.totalDocs} (${ctx.confirmados} confirmados, ${ctx.pendientes} pendientes)
- Próxima declaración SUNAT (referencial): ${ctx.vencimientoFecha} (faltan ${ctx.vencimientoDias} días; la fecha exacta depende del último dígito del RUC)
- Empresas del contador: ${ctx.empresas.join(', ')}

LO QUE PUEDES HACER POR EL USUARIO (menciónalo solo si es relevante):
- Si quiere subir una factura/boleta/foto: dile que escriba "subir factura" y le generas un enlace seguro de 15 minutos.
- Cambiar de empresa: comando /empresa [nombre].
- Ver el dashboard: ${process.env.NEXT_PUBLIC_APP_URL}

REGLAS ESTRICTAS:
1. NUNCA reveles ni inventes RUCs, razones sociales de proveedores ni montos de documentos individuales. Solo totales agregados del contexto.
2. Si te preguntan algo contable general (IGV, PCGE, regímenes, SUNAT) responde como experto contador peruano, breve y claro.
3. Si no sabes algo o no está en el contexto, dilo honestamente.
4. Responde en español, máximo 6 líneas, tono cercano y profesional.
5. Formato Telegram: solo etiquetas <b></b> y <code></code>. Sin markdown, sin otras etiquetas HTML.`,
      },
      { role: 'user', content: userMessage },
    ],
    { maxTokens: 350, temperature: 0.4 }
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
