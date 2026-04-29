// ─── Gerador de mensagens ────────────────────────────────────────────────────

export interface Lead {
  id: string
  nome: string
  sobrenome?: string
  cargo?: string
  empresa: string
  setor?: string
  tamanho?: string
  cidade?: string
  linkedin?: string
  email?: string
  info_extra?: string
  mensagem_gerada?: string
  status: 'pending' | 'generating' | 'done' | 'error'
  avaliacao?: 'up' | 'down'
  envio?: 'sent' | 'error' | 'sending'
}

export interface CampaignConfig {
  metodologia: 'CLASSICA' | 'AIDA'
  tom: 'Formal' | 'Semiformal' | 'Direto'
  canal: 'LinkedIn' | 'Email'
  limite_caracteres: number
  ia: 'gemini' | 'claude'
}

export interface ManualLead {
  nome: string
  cargo: string
  empresa: string
  setor: string
  tamanho?: string
  cidade?: string
  contexto_extra?: string
}

export interface ColumnMapping {
  nome: string
  sobrenome: string
  cargo: string
  empresa: string
  setor: string
  tamanho: string
  cidade: string
  linkedin: string
  email: string
}

// ─── CRM / Planilha ──────────────────────────────────────────────────────────

/** Registro de uma prospecção gravada na planilha. */
export interface ProspectionRecord {
  nome: string
  empresa: string
  cargo?: string
  setor?: string
  canal: 'Email' | 'LinkedIn'
  contato?: string        // URL LinkedIn ou endereço de email do lead
  observacoes?: string
  mensagem_ia?: string
}

export type ProspectionStatus =
  | 'Aguardando'
  | 'Respondeu'
  | 'Reunião'
  | 'Follow-up'
  | 'Descartado'

// ─── Gmail ───────────────────────────────────────────────────────────────────

/** Lead extraído de um email enviado. */
export interface ExtractedEmailLead {
  messageId: string
  threadId: string
  email: string
  nome: string
  assunto: string
  dataEnvio: string
}

// ─── Extração via IA (ProspectarForm) ───────────────────────────────────────

export type ConfiancaNivel = 'alta' | 'media' | 'baixa'

export interface ExtractionResult {
  nome: string | null
  cargo: string | null
  empresa: string | null
  setor: string | null
  alvo: 'Conéctar' | 'RD'
  confianca: {
    nome: ConfiancaNivel
    empresa: ConfiancaNivel
    setor: ConfiancaNivel
  }
}

// ─── Legado (mantido para compatibilidade com rotas antigas) ─────────────────

export interface PipelineLead {
  id: string
  nome: string
  cargo?: string
  empresa: string
  email?: string
  linkedin_url?: string
  fonte?: string
  mensagem_gerada?: string
  status: 'novo' | 'pronto_envio' | 'enviado' | 'respondeu' | 'follow_up'
  data_envio?: string
  data_resposta?: string
  responsavel?: string
}

export interface MemberLead {
  nome: string
  empresa: string
  setor?: string
  canal?: 'E-mail' | 'LinkedIn'
  email?: string
  linkedin_url?: string
  alvo?: string
}
