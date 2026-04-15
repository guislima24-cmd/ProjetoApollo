/**
 * Prompts e schema da tool de extração de leads.
 *
 * A Anthropic só garante saída estruturada via `tool_use` com
 * `tool_choice: { type: "tool", name: ... }`. Forçar a tool garante que o
 * `content[0].input` bate com o schema abaixo.
 */

export const EXTRACTION_TOOL = {
  name: 'salvar_lead_extraido',
  description:
    'Registra os dados de um lead extraídos a partir de email, URL do LinkedIn ou contexto fornecido pelo usuário.',
  input_schema: {
    type: 'object' as const,
    properties: {
      nome: {
        type: ['string', 'null'] as const,
        description: 'Nome completo da pessoa. Null se não houver evidência clara.',
      },
      cargo: {
        type: ['string', 'null'] as const,
        description: 'Cargo/função da pessoa. Null se não houver evidência.',
      },
      empresa: {
        type: ['string', 'null'] as const,
        description:
          'Nome da empresa. Inferir do domínio do email quando possível (ex: @nubank.com.br → Nubank).',
      },
      setor: {
        type: ['string', 'null'] as const,
        description:
          'Setor/indústria. Ex: Tecnologia, Varejo, Saúde, Financeiro, Alimentos, Educação, Fintech.',
      },
      alvo: {
        type: 'string' as const,
        enum: ['Conéctar', 'RD'],
        description:
          'Categoria de priorização. "Conéctar" para a maioria dos leads; "RD" apenas se for explicitamente um lead de RD Station ou parceria estratégica.',
      },
      confianca: {
        type: 'object' as const,
        properties: {
          nome: { type: 'string' as const, enum: ['alta', 'media', 'baixa'] },
          empresa: { type: 'string' as const, enum: ['alta', 'media', 'baixa'] },
          setor: { type: 'string' as const, enum: ['alta', 'media', 'baixa'] },
        },
        required: ['nome', 'empresa', 'setor'],
      },
    },
    required: ['alvo', 'confianca'],
  },
} as const

export function buildExtractionSystemPrompt(): string {
  return `Você é um assistente que extrai dados estruturados de leads B2B a partir de pouquíssimas informações (email, URL do LinkedIn, ou uma descrição curta).

Regras obrigatórias:
- SEMPRE chame a tool "salvar_lead_extraido". Nunca responda em texto livre.
- Se não houver evidência para um campo, retorne null com confiança "baixa". NUNCA invente.
- Empresa pode ser inferida do domínio do email (ex: maria@nestle.com.br → Nestlé, setor Alimentos). Marque confiança "alta" quando o domínio corporativo for inequívoco. Para domínios genéricos (@gmail.com, @hotmail.com, @outlook.com), retorne null e confiança "baixa".
- Nome pode ser inferido da parte local do email (ex: maria.silva@empresa.com → Maria Silva) com confiança "media". Se for só "contato@" ou similar, retorne null.
- Setor: inferir a partir da empresa quando for razoavelmente conhecida (ex: Nubank → Fintech, Magazine Luiza → Varejo). Confiança "media" se for inferência, "alta" se o usuário informou explicitamente.
- Cargo: só preencher se houver evidência direta (descrição do usuário ou texto do perfil LinkedIn colado). Caso contrário, null.
- alvo: default "Conéctar". Use "RD" apenas se explicitamente mencionado no contexto.

Seu objetivo é ser útil mas honesto: é melhor devolver null do que alucinar.`
}

export function buildExtractionUserPrompt(params: {
  email?: string
  linkedin_url?: string
  contexto?: string
}): string {
  const { email, linkedin_url, contexto } = params
  const linhas: string[] = []
  if (email) linhas.push(`Email: ${email}`)
  if (linkedin_url) linhas.push(`LinkedIn: ${linkedin_url}`)
  if (contexto) linhas.push(`Contexto adicional: ${contexto}`)
  if (linhas.length === 0) {
    linhas.push('(Sem dados — retorne todos os campos como null com confiança baixa.)')
  }
  return `Extraia os dados do lead a partir das informações abaixo e chame a tool.\n\n${linhas.join('\n')}`
}
