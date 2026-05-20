import { analyzeWithGemini } from './gemini-client'
import Anthropic from '@anthropic-ai/sdk'

export interface LinkedInEnrichment {
  potencial:             'alto' | 'medio' | 'baixo'
  melhor_decisor_index:  number
  justificativa_interna: string
  observacoes:           string
}

interface Employee { name: string; role: string; profile_url: string | null }

function buildPrompt(params: {
  nome_empresa:       string
  setor:              string
  porte:              string
  cidade:             string
  estado:             string
  linkedin_employees: Employee[]
}): string {
  const { nome_empresa, setor, porte, cidade, estado, linkedin_employees } = params

  const employeeList = linkedin_employees.length > 0
    ? linkedin_employees.map((e, i) => `${i}: ${e.name} (${e.role})`).join('\n')
    : '0: Decisor não identificado'

  return `Você é analista de pré-vendas da UFABC Júnior, empresa júnior de engenharia da Universidade Federal do ABC, em Santo André/SP.

A UFABC Júnior oferece: consultoria em processos, projetos de engenharia, análise de dados, automação, pesquisa de mercado, desenvolvimento de produtos, estudos de viabilidade.

DADOS DA EMPRESA:
Empresa: ${nome_empresa}
Setor: ${setor || 'Não informado'}
Porte: ${porte || 'Não informado'}
Cidade: ${cidade || 'Não informado'}, ${estado || 'Não informado'}

COLABORADORES ENCONTRADOS (índice: nome — cargo):
${employeeList}

Gere EXATAMENTE este JSON, sem markdown, sem texto extra:
{
  "potencial": "alto" | "medio" | "baixo",
  "melhor_decisor_index": <número inteiro — índice do colaborador mais adequado para contato comercial>,
  "justificativa_interna": "máx 300 chars. Por que esse decisor e essa empresa têm potencial (uso interno da equipe comercial).",
  "observacoes": "máx 300 chars. Contexto relevante sobre a empresa para o membro que vai prospectar. Pode ser vazio."
}

REGRAS:
- Prefira cargos de decisão: CEO, Diretor, Sócio, Head, VP — evite operacionais e de suporte
- Se não houver colaboradores, use melhor_decisor_index: 0
- melhor_decisor_index deve ser um inteiro válido dentro do range da lista
- Português brasileiro, sem markdown, sem texto fora do JSON`
}

function isValidEnrichment(obj: unknown): obj is LinkedInEnrichment {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    (o.potencial === 'alto' || o.potencial === 'medio' || o.potencial === 'baixo') &&
    typeof o.melhor_decisor_index  === 'number' &&
    typeof o.justificativa_interna === 'string' &&
    typeof o.observacoes           === 'string'
  )
}

function truncate(obj: LinkedInEnrichment): LinkedInEnrichment {
  return {
    ...obj,
    justificativa_interna: obj.justificativa_interna.slice(0, 300),
    observacoes:           obj.observacoes.slice(0, 300),
  }
}

async function enrichWithHaiku(prompt: string): Promise<LinkedInEnrichment> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages:   [{ role: 'user', content: prompt }],
  })

  const text  = msg.content.find(b => b.type === 'text')?.text ?? ''
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const parsed = JSON.parse(clean) as unknown

  if (!isValidEnrichment(parsed)) throw new Error('Haiku retornou JSON inválido')
  return truncate(parsed)
}

/**
 * Analisa uma empresa e seus colaboradores para identificar o melhor decisor
 * e classificar o potencial do lead. Chamado uma vez por empresa.
 */
export async function enrichLinkedInLead(params: {
  nome_empresa:       string
  setor:              string
  porte:              string
  cidade:             string
  estado:             string
  linkedin_employees: Array<{ name: string; role: string; profile_url: string | null }>
}): Promise<LinkedInEnrichment> {
  const prompt = buildPrompt(params)

  try {
    const result = await analyzeWithGemini<unknown>(prompt)
    if (!isValidEnrichment(result)) throw new Error('Gemini JSON inválido')
    return truncate(result)
  } catch (geminiErr) {
    console.warn('[enrich] Gemini falhou, tentando Haiku:', String(geminiErr))
  }

  return enrichWithHaiku(prompt)
}
