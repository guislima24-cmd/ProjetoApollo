export interface AgentAnalysis {
  potencial:           string
  justificativa:       string
  dores_tipicas:       string[]
  servicos_sugeridos:  string[]
  argumento_abertura:  string
}

export async function analyzeCompanyForAgent(params: {
  nome:      string
  setor:     string
  porte:     string
  cidade:    string
  industry?: string | null
  followers?: string | null
}): Promise<AgentAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const prompt = `Você é um analista de negócios da UFABC Júnior, consultoria júnior universitária especializada em projetos de engenharia, TI, gestão e marketing.
Analise a empresa abaixo e identifique oportunidades de venda de serviços de consultoria júnior.

Empresa: ${params.nome}
Setor: ${params.setor}
Porte: ${params.porte}
Cidade: ${params.cidade}${params.industry ? `\nIndústria (LinkedIn): ${params.industry}` : ''}${params.followers ? `\nSeguidores LinkedIn: ${params.followers}` : ''}

Retorne SOMENTE um JSON válido (sem blocos de código ou markdown) com esta estrutura:
{
  "potencial": "Alto|Médio|Baixo",
  "justificativa": "1-2 frases explicando por que este lead tem esse potencial",
  "dores_tipicas": ["dor 1", "dor 2", "dor 3"],
  "servicos_sugeridos": ["serviço 1", "serviço 2"],
  "argumento_abertura": "1-2 frases personalizadas para iniciar contato com este lead"
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return null

    const data = await res.json() as { content?: { text: string }[] }
    let text = data.content?.[0]?.text ?? ''
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

    return JSON.parse(text) as AgentAnalysis
  } catch {
    return null
  }
}
