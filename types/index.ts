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

// Pipeline Apollo Pro — lead no Google Sheets
export interface PipelineLead {
  id: string
  nome: string
  cargo?: string
  empresa: string
  email?: string
  linkedin_url?: string
  fonte?: string               // 'LinkedIn' | 'Gmail' | 'Manual'
  mensagem_gerada?: string
  status: PipelineStatus
  data_envio?: string
  data_resposta?: string
  responsavel?: string
}

export type PipelineStatus =
  | 'novo'
  | 'pronto_envio'
  | 'enviado'
  | 'respondeu'
  | 'follow_up'

// Lead capturado automaticamente para a aba de um membro
export interface MemberLead {
  nome: string
  empresa: string
  setor?: string
  canal?: 'E-mail' | 'LinkedIn'
  email?: string
  linkedin_url?: string
  alvo?: string   // 'Conéctar' | 'RD'
}

// ─── Auth / Prospecção ───────────────────────────────────────────────────────

export type ConfiancaNivel = 'alta' | 'media' | 'baixa'

export interface SessionPayload {
  responsavel: string
}

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
