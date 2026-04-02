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
