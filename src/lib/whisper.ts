const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

/**
 * Transcribe una nota de voz de Telegram usando Groq Whisper.
 * Flujo: getFile → descarga OGG → Groq whisper-large-v3-turbo → texto.
 * SOLO acepta mensajes de tipo "voice" (micrófono del celular).
 */
export async function transcribeVoice(fileId: string): Promise<string> {
  // 1. Obtener la ruta del archivo en los servidores de Telegram
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(fileId)}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!fileRes.ok) throw new Error(`Telegram getFile error: ${fileRes.status}`)

  const fileData = (await fileRes.json()) as { result?: { file_path?: string } }
  const filePath = fileData.result?.file_path
  if (!filePath) throw new Error('file_path no disponible')

  // 2. Descargar el OGG (Opus) desde Telegram
  const audioUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(15_000) })
  if (!audioRes.ok) throw new Error(`Telegram download error: ${audioRes.status}`)

  const audioBuffer = await audioRes.arrayBuffer()

  // 3. Enviar a Groq Whisper para transcripción en español
  const form = new FormData()
  form.append(
    'file',
    new Blob([audioBuffer], { type: 'audio/ogg' }),
    'voice.ogg'
  )
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', 'es')          // español, reduce alucinaciones
  form.append('response_format', 'json')

  const groqRes = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })

  if (!groqRes.ok) {
    const errText = await groqRes.text()
    throw new Error(`Groq Whisper error ${groqRes.status}: ${errText.slice(0, 200)}`)
  }

  const result = (await groqRes.json()) as { text?: string }
  const transcription = result.text?.trim() ?? ''

  if (!transcription) throw new Error('Groq devolvió transcripción vacía')
  return transcription
}
