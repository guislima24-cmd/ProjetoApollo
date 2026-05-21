import type { LeadStatus } from './lead'

export interface FilaCard {
  id:               string        // sysId se existe, senão "new_{csvRowIndex}_{decisorIdx}"
  sysId:            string        // vazio se não há linha na aba do membro ainda
  csvRowIndex:      number
  decisorIdx:       number
  sheetRow:         number | null // linha na aba do membro (null se não existe)

  // Empresa (da Leads CSV)
  empresa:          string
  setor:            string
  cidade:           string
  website:          string
  linkedin_empresa: string
  potencial:        string
  argumento:        string        // argumento_abertura (AI)
  dores:            string
  servicos:         string

  // Decisor ativo (cascade)
  decisorNome:      string
  decisorUrl:       string

  // Status (da aba do membro ou padrão)
  status:           LeadStatus
  tentativas:       number
  templatePitch:    string
  proximaAcao:      string
  kSugestao:        string        // sugestão para col K (col AC da aba)
  observacoes:      string
}

export interface FilaData {
  conexoes:  FilaCard[]
  followups: FilaCard[]
  totais:    { conexoes: number; followups: number }
}
