export type LeadStatus =
  | 'nao_atribuido'
  | 'nao_contatado'
  | 'enriquecido'
  | 'conexao_enviada'
  | 'conexao_aceita'
  | 'mensagem_enviada'
  | 'followup_1_enviado'
  | 'followup_2_enviado'
  | 'respondeu'
  | 'descartado'
  | 'erro_enriquecimento'

export type LeadFonte = 'apollo_csv' | 'manual'

/** Representa uma linha completa da aba Leads_Master (colunas A-AF). */
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
  data_importacao:          string      // O - ISO
  membro_responsavel:       string      // P - email
  data_atribuicao:          string      // Q - ISO
  status:                   LeadStatus  // R
  data_ultima_acao:         string      // S - ISO
  data_proxima_acao:        string      // T - ISO
  tentativas_followup:      number      // U - 0..2
  nota_conexao:             string      // V - max 300
  mensagem_boas_vindas:     string      // W - max 800
  followup_1:               string      // X - max 600
  followup_2:               string      // Y - max 400
  gancho_personalizado:     string      // Z
  justificativa_ia:         string      // AA
  observacoes:              string      // AB
  link_conversa_linkedin:   string      // AC
  ultima_mensagem_recebida: string      // AD
  data_resposta:            string      // AE - ISO
  data_descartado:          string      // AF - ISO
}
