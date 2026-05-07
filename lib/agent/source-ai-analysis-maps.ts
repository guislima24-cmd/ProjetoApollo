export interface MapsAnalysis {
  potencial:          'alto' | 'medio' | 'baixo'
  justificativa:      string
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  melhor_canal:       'ligacao' | 'whatsapp' | 'ambos'
  melhor_horario:     'manhã' | 'tarde' | 'ambos'
  argumento_abertura: string
}

export async function analyzeCompanyForMaps(params: {
  nome:     string
  tipos:    string[]
  cidade:   string
  endereco: string
  site?:    string | null
  horario?: string | null
}): Promise<MapsAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const { nome, tipos, cidade, endereco, site, horario } = params

  const prompt = `Você é analista de pré-vendas da UFABC Júnior (empresa júnior de engenharia, Santo André/SP).
Analise a empresa abaixo e retorne APENAS JSON válido, sem markdown.

Empresa: ${nome}
Setor/Tipo: ${tipos.join(', ')}
Cidade: ${cidade}
Endereço: ${endereco}
Site: ${site ?? 'Não informado'}
Horário: ${horario ?? 'Não informado'}

{
  "potencial": "alto",
  "justificativa": "uma frase objetiva",
  "dores_tipicas": ["dor 1", "dor 2"],
  "servicos_sugeridos": ["serviço EJ 1", "serviço EJ 2"],
  "melhor_canal": "ligacao",
  "melhor_horario": "manhã",
  "argumento_abertura": "frase de abertura para ligação fria ou WhatsApp, direta e específica"
}

Serviços UFABC Júnior: consultoria em processos, projetos de engenharia, análise de dados, automação, pesquisa de mercado, desenvolvimento de produtos, estudos de viabilidade.
Valores para potencial: "alto", "medio" ou "baixo".
Valores para melhor_canal: "ligacao", "whatsapp" ou "ambos".
Valores para melhor_horario: "manhã", "tarde" ou "ambos".`

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
        max_tokens: 512,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return null

    const data = await res.json() as { content?: { text: string }[] }
    let text = (data.content?.[0]?.text ?? '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as MapsAnalysis
  } catch {
    return null
  }
}
