import { analyzeWithGemini } from './gemini-client'

export interface ApolloAnalysis {
  potencial:           string
  justificativa:       string
  dores_tipicas:       string[]
  servicos_sugeridos:  string[]
  argumento_abertura:  string
  score_fit:           number   // 1–10
}

const FALLBACK: ApolloAnalysis = {
  potencial:          'Não analisado',
  justificativa:      'Erro na análise de IA',
  dores_tipicas:      [],
  servicos_sugeridos: [],
  argumento_abertura: '',
  score_fit:          5,
}

export async function analyzeCompanyForApollo(params: {
  nome:          string
  setor:         string
  porte:         string
  cidade:        string
  website?:      string | null
  funcionarios?: string | null
  resumo_site?:  string | null
}): Promise<ApolloAnalysis | null> {
  const contextLines = [
    `Empresa: ${params.nome}`,
    `Setor: ${params.setor}`,
    `Porte estimado: ${params.porte}`,
    `Localização: ${params.cidade}`,
    params.funcionarios ? `Funcionários: ${params.funcionarios}` : null,
    params.website      ? `Website: ${params.website}`           : null,
    params.resumo_site  ? `\nTrecho do site:\n"${params.resumo_site.slice(0, 600)}"` : null,
  ].filter(Boolean).join('\n')

  const prompt = `Você é um analista sênior da UFABC Júnior, consultoria júnior universitária especializada em Engenharia, TI, Gestão e Marketing.
Analise a empresa abaixo e avalie o potencial de venda de serviços de consultoria júnior, considerando o contexto real do site e porte da empresa.

${contextLines}

Retorne SOMENTE um JSON válido (sem blocos de código ou markdown) com esta estrutura:
{
  "potencial": "Alto|Médio|Baixo",
  "justificativa": "2-3 frases explicando o potencial desta empresa como cliente da consultoria júnior",
  "dores_tipicas": ["dor específica 1", "dor específica 2", "dor específica 3"],
  "servicos_sugeridos": ["serviço mais relevante 1", "serviço mais relevante 2"],
  "argumento_abertura": "2 frases personalizadas e diretas para um primeiro contato por email ou LinkedIn, mencionando o setor e um benefício concreto",
  "score_fit": 7
}

Regras:
- score_fit de 1 a 10: quanto maior, mais adequado à UFABC Júnior (considere porte pequeno/médio, setor relevante, região São Paulo/ABC)
- Seja específico com dores e serviços — evite genéricos como "consultoria estratégica"
- argumento_abertura deve ser pronto para copiar e usar`

  try {
    const parsed = await analyzeWithGemini<ApolloAnalysis>(prompt)
    parsed.score_fit = Math.min(10, Math.max(1, Number(parsed.score_fit) || 5))
    return parsed
  } catch (error) {
    console.error('[GEMINI] Falha na análise Apollo, salvando sem IA:', error)
    return FALLBACK
  }
}
