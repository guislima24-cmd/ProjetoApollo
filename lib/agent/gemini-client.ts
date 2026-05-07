// Cliente Gemini Flash para análise de leads em massa
// Modelo: gemini-1.5-flash — gratuito até 1M tokens/dia
// NOTA: adicionar GEMINI_API_KEY no Vercel → Settings → Environment Variables

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'

export async function analyzeWithGemini<T = Record<string, unknown>>(
  prompt: string
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('[GEMINI] GEMINI_API_KEY não configurada no .env')
  }

  console.log('[GEMINI] Enviando prompt para análise…')

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

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`[GEMINI] Erro na API: ${response.status} — ${error}`)
  }

  const data = await response.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('[GEMINI] Resposta vazia da API')
  }

  try {
    const parsed = JSON.parse(text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()) as T
    console.log('[GEMINI] Análise concluída com sucesso')
    return parsed
  } catch {
    throw new Error(`[GEMINI] JSON inválido na resposta: ${text.substring(0, 200)}`)
  }
}
