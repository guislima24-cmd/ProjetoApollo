import { analyzeWithGemini } from './gemini-client'
import Anthropic from '@anthropic-ai/sdk'

export interface LinkedInEnrichment {
  nota_conexao:         string  // max 300
  mensagem_boas_vindas: string  // max 800
  followup_1:           string  // max 600
  followup_2:           string  // max 400
  gancho_personalizado: string
  justificativa_ia:     string
}

const MAX_LENGTHS: Record<keyof LinkedInEnrichment, number> = {
  nota_conexao:         300,
  mensagem_boas_vindas: 800,
  followup_1:           600,
  followup_2:           400,
  gancho_personalizado: 300,
  justificativa_ia:     300,
}

function buildPrompt(params: {
  nome_empresa:  string
  setor:         string
  porte:         string
  cidade:        string
  estado:        string
  nome_decisor:  string
  cargo_decisor: string
}): string {
  const { nome_empresa, setor, porte, cidade, estado, nome_decisor, cargo_decisor } = params

  return `Você é analista de pré-vendas da UFABC Júnior, empresa júnior de engenharia da Universidade Federal do ABC, em Santo André/SP.

A UFABC Júnior oferece: consultoria em processos, projetos de engenharia, análise de dados, automação, pesquisa de mercado, desenvolvimento de produtos, estudos de viabilidade.

DADOS DO LEAD:
Empresa: ${nome_empresa}
Setor: ${setor || 'Não informado'}
Porte: ${porte || 'Não informado'}
Cidade: ${cidade || 'Não informado'}, ${estado || 'Não informado'}
Decisor: ${nome_decisor || 'Não informado'} (${cargo_decisor || 'Não informado'})

Gere EXATAMENTE este JSON, sem markdown, sem texto extra:
{
  "nota_conexao": "máx 300 chars. Tom curioso, sem vender. Mencionar algo específico do setor ou cargo. Não usar parabéns pela conquista.",
  "mensagem_boas_vindas": "máx 800 chars. Agradece a conexão, se apresenta como pré-vendas da UFABC Júnior, faz pergunta sobre dor específica do setor. Sem pitch de venda direto.",
  "followup_1": "máx 600 chars. Retoma o assunto da boas-vindas, oferece algo de valor (case, artigo, conversa rápida). Sem pressão.",
  "followup_2": "máx 400 chars. Último contato, soft close. Algo como se faz sentido depois, fico à disposição.",
  "gancho_personalizado": "frase de 1 linha sobre por que essa empresa específica é interessante",
  "justificativa_ia": "por que esse lead tem potencial (1 frase)"
}

REGRAS:
- Se faltar dado importante (setor vazio, cargo vazio), faça mensagem genérica boa, NÃO INVENTE fato específico
- Tom consultivo, sem urgência artificial
- Português brasileiro, formal mas natural
- Mencionar UFABC Júnior, não "nossa empresa"`
}

function truncate(obj: LinkedInEnrichment): LinkedInEnrichment {
  const result = { ...obj }
  for (const [key, max] of Object.entries(MAX_LENGTHS)) {
    const k = key as keyof LinkedInEnrichment
    if (result[k].length > max) result[k] = result[k].slice(0, max)
  }
  return result
}

function isValidEnrichment(obj: unknown): obj is LinkedInEnrichment {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.nota_conexao         === 'string' &&
    typeof o.mensagem_boas_vindas === 'string' &&
    typeof o.followup_1           === 'string' &&
    typeof o.followup_2           === 'string' &&
    typeof o.gancho_personalizado === 'string' &&
    typeof o.justificativa_ia     === 'string'
  )
}

async function enrichWithHaiku(prompt: string): Promise<LinkedInEnrichment> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages:   [{ role: 'user', content: prompt }],
  })

  const text = msg.content.find(b => b.type === 'text')?.text ?? ''
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const parsed = JSON.parse(clean) as unknown

  if (!isValidEnrichment(parsed)) throw new Error('Haiku retornou JSON inválido')
  return truncate(parsed)
}

/**
 * Enriquece um lead com as 4 mensagens LinkedIn via Gemini (fallback: Claude Haiku).
 * Lança erro se ambos falharem.
 */
export async function enrichLinkedInLead(params: {
  nome_empresa:  string
  setor:         string
  porte:         string
  cidade:        string
  estado:        string
  nome_decisor:  string
  cargo_decisor: string
}): Promise<LinkedInEnrichment> {
  const prompt = buildPrompt(params)

  // Tentativa com Gemini
  try {
    const result = await analyzeWithGemini<unknown>(prompt)
    if (!isValidEnrichment(result)) throw new Error('Gemini JSON inválido')
    return truncate(result)
  } catch (geminiErr) {
    console.warn('[enrich] Gemini falhou, tentando Haiku:', String(geminiErr))
  }

  // Fallback: Claude Haiku
  return enrichWithHaiku(prompt)
}
