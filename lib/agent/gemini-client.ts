// Cliente Gemini Flash para análise de leads em massa
// Modelo: gemini-flash-latest — alias estável, sempre aponta para a versão free mais recente
// NOTA: adicionar GEMINI_API_KEY no Vercel → Settings → Environment Variables

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent'

const MAX_RETRIES = 3

export async function analyzeWithGemini<T = Record<string, unknown>>(
  prompt: string
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY

  // [DIAG] logs temporários para diagnóstico — remover após confirmar funcionamento
  console.log('[GEMINI] Iniciando análise para:', prompt.substring(0, 100))
  console.log('[GEMINI] API Key presente:', !!apiKey)

  if (!apiKey) {
    throw new Error('[GEMINI] GEMINI_API_KEY não configurada no .env')
  }

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      const delay = Math.pow(2, attempt - 1) * 2000 // 2s, 4s, 8s
      console.log(`[GEMINI] Tentativa ${attempt}/${MAX_RETRIES} após ${delay}ms (rate limit)…`)
      await new Promise(r => setTimeout(r, delay))
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:       0.3,
          maxOutputTokens:   1000,
          responseMimeType:  'application/json',
        },
      }),
    })

    if (response.status === 429) {
      const body = await response.text()
      console.warn(`[GEMINI] Rate limit (429) na tentativa ${attempt}: ${body.substring(0, 200)}`)
      lastError = new Error(`[GEMINI] Rate limit: ${response.status} — ${body.substring(0, 200)}`)
      continue // retry
    }

    if (!response.ok) {
      const body = await response.text()
      console.error(`[GEMINI] Erro HTTP ${response.status}:`, body.substring(0, 500))
      throw new Error(`[GEMINI] Erro na API: ${response.status} — ${body.substring(0, 200)}`)
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    // [DIAG] log temporário — remover após confirmar funcionamento
    console.log('[GEMINI] Resposta bruta (primeiros 300 chars):', text?.substring(0, 300) ?? '(vazia)')

    if (!text) {
      throw new Error('[GEMINI] Resposta vazia da API')
    }

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
