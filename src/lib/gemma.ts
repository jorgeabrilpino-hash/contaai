const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

async function callGemma4(
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
      model: process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free',
      messages,
      max_tokens: options?.maxTokens ?? 1000,
      temperature: options?.temperature ?? 0.1,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemma 4 API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  return data.choices[0].message.content as string
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
  if (/subir|upload|factura|boleta|documento|comprobante|foto|imagen|adjunt|pdf|archivo/.test(t))
    return 'upload'
  if (/igv|impuesto.*venta|tax|tribut/.test(t))
    return 'query_igv'
  if (/venc|plazo|declar|cronograma|cuándo|cuando|fecha.*sunat|sunat.*fecha/.test(t))
    return 'query_vencimiento'
  if (/factura|boleta|pendiente|cuánta|cuanta|document|revisar|registro/.test(t))
    return 'query_facturas'
  return null
}

export async function classifyIntent(message: string): Promise<BotIntent> {
  // Keywords first — fast and reliable on free tier
  const kwIntent = detectIntentByKeywords(message)
  if (kwIntent) return kwIntent

  // Gemma 4 for ambiguous messages
  try {
    const raw = await callGemma4(
      [
        {
          role: 'system',
          content: `Classify the user message into exactly one label.
Respond with ONLY one of these exact strings, nothing else:
upload
query_igv
query_vencimiento
query_facturas
unknown`,
        },
        {
          role: 'user',
          content: message,
        },
      ],
      { maxTokens: 20, temperature: 0 }
    )

    const first = raw.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z_]/g, '')
    const valid: BotIntent[] = ['upload', 'query_igv', 'query_vencimiento', 'query_facturas']
    return valid.includes(first as BotIntent) ? (first as BotIntent) : 'unknown'
  } catch {
    return 'unknown'
  }
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
