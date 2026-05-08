import { analyzeWithGemini } from './gemini-client'

export interface CsvAnalysis {
  potencial:          'alto' | 'medio' | 'baixo'
  justificativa:      string
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  melhor_canal:       'ligacao' | 'whatsapp' | 'ambos'
  argumento_abertura: string
  score_fit:          number
  contatos_alvo:      string[]
}

export async function analyzeCsvLead(params: {
  nome:                string
  setor?:              string | null
  cidade?:             string | null
  funcionarios?:       string | null
  website?:            string | null
  linkedin_url?:       string | null
  website_text?:       string | null
  linkedin_text?:      string | null
  linkedin_employees?: Array<{ name: string; role: string }> | null
}): Promise<CsvAnalysis | null> {
  const { nome, setor, cidade, funcionarios, website, linkedin_url, website_text, linkedin_text, linkedin_employees } = params

  const employeesBlock = linkedin_employees?.length
    ? linkedin_employees.map(e => `${e.name}${e.role ? ` — ${e.role}` : ''}`).join('\n')
    : '(nenhum identificado)'

  const prompt = `Você é analista de pré-vendas da UFABC Júnior (empresa júnior de engenharia, Santo André/SP).
Analise a empresa abaixo e retorne APENAS JSON válido, sem markdown.

Empresa: ${nome}
Setor: ${setor ?? 'Não informado'}
Cidade: ${cidade ?? 'Não informado'}
Funcionários: ${funcionarios ?? 'Não informado'}
Site: ${website ?? 'Não informado'}
LinkedIn: ${linkedin_url ?? 'Não informado'}

--- Colaboradores identificados no LinkedIn ---
${employeesBlock}

--- Conteúdo do site ---
${website_text?.trim() || '(sem conteúdo)'}

--- Conteúdo do LinkedIn ---
${linkedin_text?.trim() || '(sem conteúdo)'}

{
  "potencial": "alto",
  "justificativa": "uma frase objetiva explicando o potencial",
  "dores_tipicas": ["dor 1", "dor 2"],
  "servicos_sugeridos": ["serviço EJ 1", "serviço EJ 2"],
  "melhor_canal": "ligacao",
  "argumento_abertura": "frase de abertura para ligação fria ou WhatsApp, direta e específica",
  "score_fit": 8,
  "contatos_alvo": ["Nome Sobrenome — Cargo (LinkedIn)", "Cargo a buscar (sugestão)"]
}

Serviços UFABC Júnior: consultoria em processos, projetos de engenharia, análise de dados, automação, pesquisa de mercado, desenvolvimento de produtos, estudos de viabilidade.
Valores para potencial: "alto", "medio" ou "baixo".
Valores para melhor_canal: "ligacao", "whatsapp" ou "ambos".
score_fit: número inteiro de 1 a 10 (10 = fit perfeito com UFABC Júnior).
contatos_alvo: liste até 3 contatos ideais para prospecção. Se há colaboradores reais acima, priorize-os com formato "Nome — Cargo (LinkedIn)". Complete com cargos típicos a buscar nessa empresa: "Cargo (sugestão)". Foque em decisores: CEO, sócio, diretor, gerente.`

  return await analyzeWithGemini<CsvAnalysis>(prompt)
}
