// Cliente Gemini Flash para análise de leads em massa
// Tenta candidatos gratuitos em ordem até encontrar um que funcione
// NOTA: adicionar GEMINI_API_KEY no Vercel → Settings → Environment Variables

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

// Candidatos gratuitos em ordem de preferência
const MODEL_CANDIDATES = [
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]

// Cache do modelo que funcionou (evita re-discovery a cada chamada)
let resolvedModel: string | null = null

async function resolveModel(apiKey: string): Promise<string> {
  if (resolvedModel) return resolvedModel

  for (const model of MODEL_CANDIDATES) {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: '{"ok":true}' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 10, responseMimeType: 'application/json' },
        }),
      })
      if (res.ok || res.status === 429) {
        // 429 = rate limit mas modelo existe — aceitável
        console.log(`[GEMINI] Modelo selecionado: ${model}`)
        resolvedModel = model
        return model
      }
      console.log(`[GEMINI] Modelo ${model} → ${res.status}, tentando próximo…`)
    } catch {}
  }

  throw new Error(`[GEMINI] Nenhum modelo disponível para esta chave. Candidatos testados: ${MODEL_CANDIDATES.join(', ')}`)
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
      const delay = Math.pow(2, attempt - 1) * 2000
      console.log(`[GEMINI] Tentativa ${attempt}/${MAX_RETRIES} após ${delay}ms…`)
      await new Promise(r => setTimeout(r, delay))
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.3,
          maxOutputTokens:  1000,
          responseMimeType: 'application/json',
        },
      }),
    })

    if (response.status === 429) {
      const body = await response.text()
      console.warn(`[GEMINI] Rate limit (429) tentativa ${attempt}: ${body.substring(0, 200)}`)
      lastError = new Error(`[GEMINI] Rate limit: ${response.status} — ${body.substring(0, 200)}`)
      continue
    }

    if (!response.ok) {
      const body = await response.text()
      console.error(`[GEMINI] Erro HTTP ${response.status}:`, body.substring(0, 500))
      // Modelo pode ter sido revogado — força rediscovery na próxima chamada
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
