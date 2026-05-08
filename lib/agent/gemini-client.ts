// Cliente Gemini Flash para análise de leads em massa
// NOTA: adicionar GEMINI_API_KEY no Vercel → Settings → Environment Variables

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

// Candidatos em ordem: modelos com quota generosa no free tier primeiro
const MODEL_CANDIDATES = [
  'gemini-1.5-flash-8b',   // 1.500 req/dia, 15 RPM — melhor para volume
  'gemini-1.5-flash',      // 1.500 req/dia, 15 RPM
  'gemini-2.0-flash-lite', // quota menor no free tier
  'gemini-2.5-flash-lite', // quota muito restrita no free tier
  'gemini-2.5-flash',
]

// Rate limiter: no máximo 1 chamada a cada 4s (respeita 15 RPM do free tier)
let lastCallTime = 0
async function rateLimit() {
  const MIN_MS = 4200 // margem acima de 4s para segurança
  const elapsed = Date.now() - lastCallTime
  if (elapsed < MIN_MS) {
    await new Promise(r => setTimeout(r, MIN_MS - elapsed))
  }
  lastCallTime = Date.now()
}

// Cache do modelo que funcionou
let resolvedModel: string | null = null

async function resolveModel(apiKey: string): Promise<string> {
  if (resolvedModel) return resolvedModel

  for (const model of MODEL_CANDIDATES) {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ok' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5 },
        }),
      })
      const body = await res.text().catch(() => '')

      // Quota esgotada = modelo existe mas limite diário atingido — pular
      if (res.status === 429 && body.includes('exceeded your current quota')) {
        console.log(`[GEMINI] Modelo ${model} → quota diária esgotada, tentando próximo…`)
        continue
      }
      // 200 ou 429 de rate limit (RPM) = modelo funcional
      if (res.ok || res.status === 429) {
        console.log(`[GEMINI] Modelo selecionado: ${model}`)
        resolvedModel = model
        return model
      }
      console.log(`[GEMINI] Modelo ${model} → ${res.status}: ${body.substring(0, 80)}, tentando próximo…`)
    } catch (e) {
      console.log(`[GEMINI] Modelo ${model} → exception: ${e}, tentando próximo…`)
    }
  }

  throw new Error(`[GEMINI] Nenhum modelo disponível. Testados: ${MODEL_CANDIDATES.join(', ')}`)
}

const MAX_RETRIES = 3

export async function analyzeWithGemini<T = Record<string, unknown>>(
  prompt: string
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY

  // [DIAG] logs temporários — remover após confirmar funcionamento
  console.log('[GEMINI] Iniciando análise para:', prompt.substring(0, 100))
  console.log('[GEMINI] API Key presente:', !!apiKey)

  if (!apiKey) {
    throw new Error('[GEMINI] GEMINI_API_KEY não configurada no .env')
  }

  const model = await resolveModel(apiKey)
  const url   = `${BASE_URL}/${model}:generateContent?key=${apiKey}`

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      const delay = Math.pow(2, attempt - 1) * 3000 // 3s, 6s, 12s
      console.log(`[GEMINI] Tentativa ${attempt}/${MAX_RETRIES} após ${delay}ms…`)
      await new Promise(r => setTimeout(r, delay))
    }

    // Respeita rate limit antes de cada chamada
    await rateLimit()

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.3,
          maxOutputTokens:  2048,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (response.status === 429) {
      const body = await response.text()
      // Quota diária esgotada = não adianta retry, trocar modelo
      if (body.includes('exceeded your current quota')) {
        console.error(`[GEMINI] Quota diária esgotada para ${model}`)
        resolvedModel = null // força rediscovery com próximo modelo
        throw new Error(`[GEMINI] Quota diária esgotada para ${model}. Tente outro modelo ou aguarde amanhã.`)
      }
      console.warn(`[GEMINI] Rate limit (429) tentativa ${attempt}: ${body.substring(0, 200)}`)
      lastError = new Error(`[GEMINI] Rate limit: ${body.substring(0, 100)}`)
      continue
    }

    if (!response.ok) {
      const body = await response.text()
      console.error(`[GEMINI] Erro HTTP ${response.status}:`, body.substring(0, 500))
      resolvedModel = null
      throw new Error(`[GEMINI] Erro na API (${model}): ${response.status} — ${body.substring(0, 200)}`)
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    // [DIAG] log temporário — remover após confirmar funcionamento
    console.log('[GEMINI] Resposta bruta (primeiros 300 chars):', text?.substring(0, 300) ?? '(vazia)')

    if (!text) throw new Error('[GEMINI] Resposta vazia da API')

    try {
      const parsed = JSON.parse(text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()) as T
      console.log('[GEMINI] Análise concluída com sucesso')
      return parsed
    } catch {
      throw new Error(`[GEMINI] JSON inválido na resposta: ${text.substring(0, 500)}`)
    }
  }

  throw lastError ?? new Error('[GEMINI] Falha após todas as tentativas')
}
