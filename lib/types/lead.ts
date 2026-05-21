export type LeadStatus =
  | 'nao_atribuido'
  | 'nao_contatado'
  | 'enriquecido'
  | 'conexao_enviada'
  | 'conexao_aceita'
  | 'mensagem_enviada'
  | 'followup_1_enviado'
  | 'followup_2_enviado'
  | 'followup_3_enviado'
  | 'followup_4_enviado'
  | 'followup_5_enviado'
  | 'respondeu'
  | 'descartado'
  | 'erro_enriquecimento'

export type LeadFonte = 'apollo_csv' | 'manual'

// ── Linha da aba "Leads CSV" (pool central) ───────────────────────────────────

export interface LeadCSV {
  rowIndex:           number   // 1-based, calculado em runtime (não armazenado)
  data:               string   // A — DD/MM/AAAA
  empresa:            string   // B
  setor:              string   // C
  cidade:             string   // D
  funcionarios:       string   // E
  website:            string   // F
  linkedin_url:       string   // G
  telefone:           string   // H
  email:              string   // I
  potencial:          string   // J — "alto" | "medio" | "baixo"
  score_fit:          string   // K — "9", "8", ...
  justificativa:      string   // L
  dores_tipicas:      string   // M — separado por "; "
  servicos_sugeridos: string   // N — separado por "; "
  melhor_canal:       string   // O
  argumento_abertura: string   // P
  decisores_linkedin: string   // Q — "Nome | URL\nNome2 | URL2"
  membro:             string   // R — nome da aba: "Gui Lima"
  prospectado:        string   // S — índices tentados: "0", "0,1", ""
  data_prospeccao:    string   // T — DD/MM/AAAA do primeiro envio
}

// ── Linha da aba individual do membro (ex: "Gui Lima") ───────────────────────
// Colunas A–U: gerenciadas manualmente pela equipe (sistema só lê)
// Colunas V–AC: gerenciadas exclusivamente pelo sistema

export interface MemberLead {
  sheetRow:              number     // 1-based, calculado em runtime
  // A–U (humano)
  alvo:                  string     // A
  mes:                   string     // B
  canal:                 string     // C
  setor:                 string     // D
  empresa:               string     // E — "Empresa contatada"
  nome_contato:          string     // F — nome do decisor
  numero_link:           string     // G — URL LinkedIn ou telefone
  quem_respondeu:        string     // H
  data_conexao:          string     // I — DD/MM/AAAA
  quantos_contatos:      string     // J — contagem de mensagens enviadas
  marcou_rd:             string     // K
  data_rd:               string     // L
  no_show:               string     // M
  sql:                   string     // N
  marcou_rp:             string     // O
  data_proposta:         string     // P
  contrato:              string     // Q
  data_contrato:         string     // R
  motivo_recusa:         string     // S
  ciclo_conversao:       string     // T
  observacoes:           string     // U
  // V–AC (sistema)
  sys_id:                string     // V — UUID único
  sys_status:            LeadStatus // W
  sys_data_ultima_acao:  string     // X — ISO timestamp
  sys_data_proxima_acao: string     // Y — ISO timestamp
  sys_tentativas:        string     // Z — "0", "1", ...
  sys_template_pitch:    string     // AA — "pitch_curto" | "pitch_longo"
  sys_leads_csv_row:     string     // AB — linha de origem na Leads CSV
  sys_k_sugestao:        string     // AC — sugestão pendente para col K
}

// ── Linha da Leads_Master (legado) ───────────────────────────────────────────

/** @deprecated Usar LeadCSV + MemberLead. Leads_Master não é mais usada. */
export interface LeadMaster {
  id_lead:                  string      // A
  nome_empresa:             string      // B
  setor:                    string      // C
  porte:                    string      // D
  cidade:                   string      // E
  estado:                   string      // F
  site:                     string      // G
  linkedin_empresa:         string      // H
  nome_decisor:             string      // I
  cargo_decisor:            string      // J
  linkedin_decisor:         string      // K
  email_decisor:            string      // L
  telefone_decisor:         string      // M
  fonte:                    LeadFonte   // N
  data_importacao:          string      // O
  membro_responsavel:       string      // P
  data_atribuicao:          string      // Q
  status:                   LeadStatus  // R
  data_ultima_acao:         string      // S
  data_proxima_acao:        string      // T
  tentativas_followup:      number      // U
  nota_conexao:             string      // V
  mensagem_pitch:           string      // W
  followup_1:               string      // X
  followup_2:               string      // Y
  gancho_personalizado:     string      // Z
  justificativa_ia:         string      // AA
  observacoes:              string      // AB
  link_conversa_linkedin:   string      // AC
  ultima_mensagem_recebida: string      // AD
  data_resposta:            string      // AE
  data_descartado:          string      // AF
  template_pitch_usado:     string      // AG
}
