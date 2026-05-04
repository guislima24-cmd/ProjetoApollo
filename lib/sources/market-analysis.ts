/**
 * Fonte 3: Análise de mercado por IA (Claude Sonnet).
 *
 * Usa ANTHROPIC_API_KEY já configurado no projeto.
 * Modelo: claude-sonnet-4-20250514
 *
 * Degradação graciosa: se a API falhar por qualquer motivo,
 * retorna null — o lead segue sem análise de IA.
 */

export interface MarketAnalysis {
  potencial:            'alto' | 'medio' | 'baixo'
  justificativa:        string
  dores_tipicas:        string[]
  servicos_sugeridos:   string[]
  argumento_abertura:   string
}

export async function analyzeMarket(params: {
  nome:   string
  setor:  string
  porte:  string
  cidade: string
}): Promise<MarketAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[market-analysis] ANTHROPIC_API_KEY não configurada')
    return null
  }

  const prompt = `Você é um analista de mercado especializado em empresas juniores de engenharia. Analise brevemente a empresa abaixo e responda APENAS em JSON válido, sem markdown, sem texto fora do JSON.

Empresa: ${params.nome}
Setor: ${params.setor}
Porte: ${params.porte}
Cidade: ${params.cidade}

Retorne exatamente este JSON (campos "potencial" deve ser "alto", "medio" ou "baixo"):
{
  "potencial": "alto",
  "justificativa": "uma frase explicando o potencial para a empresa júnior",
  "dores_tipicas": ["dor do mercado 1", "dor do mercado 2"],
  "servicos_sugeridos": ["serviço de engenharia adequado 1", "serviço adequado 2"],
  "argumento_abertura": "frase de abertura personalizada para cold outreach B2B"
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      console.error(`[market-analysis] Claude ${res.status}:`, err.error?.message)
      return null
    }

    const data = await res.json() as { content: Array<{ text: string }> }
    const text  = data.content[0]?.text ?? ''
    const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
    return JSON.parse(clean) as MarketAnalysis
  } catch (err) {
    console.error(`[market-analysis] Erro para "${params.nome}":`, err)
    return null
  }
}
