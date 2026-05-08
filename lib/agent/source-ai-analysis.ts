import { analyzeWithGemini } from './gemini-client'

export interface AgentAnalysis {
  potencial:           string
  justificativa:       string
  dores_tipicas:       string[]
  servicos_sugeridos:  string[]
  argumento_abertura:  string
}

const FALLBACK: AgentAnalysis = {
  potencial:          'Não analisado',
  justificativa:      'Erro na análise de IA',
  dores_tipicas:      [],
  servicos_sugeridos: [],
  argumento_abertura: '',
}

export async function analyzeCompanyForAgent(params: {
  nome:       string
  setor:      string
  porte:      string
  cidade:     string
  industry?:  string | null
  followers?: string | null
}): Promise<AgentAnalysis | null> {
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
    return await analyzeWithGemini<AgentAnalysis>(prompt)
  } catch (error) {
    console.error('[GEMINI] Falha na análise LinkedIn, salvando sem IA:', error)
    return FALLBACK
  }
}
