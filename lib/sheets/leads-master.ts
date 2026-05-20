import { randomUUID } from 'crypto'
import { getSheets, getSpreadsheetId, withRetry, sanitize } from './client'
import type { LeadMaster, LeadStatus, LeadFonte } from '@/lib/types/lead'

const TAB = 'Leads_Master'

const HEADERS: string[] = [
  'id_lead',                  // A
  'nome_empresa',             // B
  'setor',                    // C
  'porte',                    // D
  'cidade',                   // E
  'estado',                   // F
  'site',                     // G
  'linkedin_empresa',         // H
  'nome_decisor',             // I
  'cargo_decisor',            // J
  'linkedin_decisor',         // K
  'email_decisor',            // L
  'telefone_decisor',         // M
  'fonte',                    // N
  'data_importacao',          // O
  'membro_responsavel',       // P
  'data_atribuicao',          // Q
  'status',                   // R
  'data_ultima_acao',         // S
  'data_proxima_acao',        // T
  'tentativas_followup',      // U
  'nota_conexao',             // V
  'mensagem_pitch',           // W
  'followup_1',               // X
  'followup_2',               // Y
  'gancho_personalizado',     // Z
  'justificativa_ia',         // AA
  'observacoes',              // AB
  'link_conversa_linkedin',   // AC
  'ultima_mensagem_recebida', // AD
  'data_resposta',            // AE
  'data_descartado',          // AF
  'template_pitch_usado',     // AG
]

// A-Z = 26 cols, AA-AG = 7 cols → last col = AG (col 33)
const LAST_COL = 'AG'

let tabEnsured = false

export async function ensureLeadsMasterTab(): Promise<void> {
  if (tabEnsured) return
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const meta = await withRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }),
  )
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    })
  }

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `'${TAB}'!A1:${LAST_COL}1`,
      valueInputOption: 'RAW',
      requestBody:      { values: [HEADERS] },
    }),
  )

  tabEnsured = true
}

function leadToRow(lead: LeadMaster): string[] {
  return [
    lead.id_lead,
    sanitize(lead.nome_empresa),
    sanitize(lead.setor),
    sanitize(lead.porte),
    sanitize(lead.cidade),
    sanitize(lead.estado),
    lead.site,
    lead.linkedin_empresa,
    sanitize(lead.nome_decisor),
    sanitize(lead.cargo_decisor),
    lead.linkedin_decisor,
    lead.email_decisor,
    lead.telefone_decisor,
    lead.fonte,
    lead.data_importacao,
    lead.membro_responsavel,
    lead.data_atribuicao,
    lead.status,
    lead.data_ultima_acao,
    lead.data_proxima_acao,
    String(lead.tentativas_followup),
    sanitize(lead.nota_conexao),
    sanitize(lead.mensagem_pitch),
    sanitize(lead.followup_1),
    sanitize(lead.followup_2),
    sanitize(lead.gancho_personalizado),
    sanitize(lead.justificativa_ia),
    sanitize(lead.observacoes),
    lead.link_conversa_linkedin,
    sanitize(lead.ultima_mensagem_recebida),
    lead.data_resposta,
    lead.data_descartado,
    lead.template_pitch_usado,
  ]
}

function rowToLead(row: string[]): LeadMaster {
  return {
    id_lead:                  row[0]  ?? '',
    nome_empresa:             row[1]  ?? '',
    setor:                    row[2]  ?? '',
    porte:                    row[3]  ?? '',
    cidade:                   row[4]  ?? '',
    estado:                   row[5]  ?? '',
    site:                     row[6]  ?? '',
    linkedin_empresa:         row[7]  ?? '',
    nome_decisor:             row[8]  ?? '',
    cargo_decisor:            row[9]  ?? '',
    linkedin_decisor:         row[10] ?? '',
    email_decisor:            row[11] ?? '',
    telefone_decisor:         row[12] ?? '',
    fonte:                    (row[13] ?? 'manual') as LeadFonte,
    data_importacao:          row[14] ?? '',
    membro_responsavel:       row[15] ?? '',
    data_atribuicao:          row[16] ?? '',
    status:                   (row[17] ?? 'nao_atribuido') as LeadStatus,
    data_ultima_acao:         row[18] ?? '',
    data_proxima_acao:        row[19] ?? '',
    tentativas_followup:      parseInt(row[20] ?? '0', 10) || 0,
    nota_conexao:             row[21] ?? '',
    mensagem_pitch:           row[22] ?? '',
    followup_1:               row[23] ?? '',
    followup_2:               row[24] ?? '',
    gancho_personalizado:     row[25] ?? '',
    justificativa_ia:         row[26] ?? '',
    observacoes:              row[27] ?? '',
    link_conversa_linkedin:   row[28] ?? '',
    ultima_mensagem_recebida: row[29] ?? '',
    data_resposta:            row[30] ?? '',
    data_descartado:          row[31] ?? '',
    template_pitch_usado:     row[32] ?? '',
  }
}

/**
 * Insere um lead novo na Leads_Master.
 * Gera o id_lead automaticamente e retorna o UUID gerado.
 */
export async function insertLead(
  lead: Omit<LeadMaster, 'id_lead'>,
): Promise<string> {
  await ensureLeadsMasterTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const id_lead = randomUUID()
  const full: LeadMaster = { id_lead, ...lead }
  const row = leadToRow(full)

  await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range:            `'${TAB}'!A:${LAST_COL}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: [row] },
    }),
  )

  console.log(`[leads-master] insertLead: ${id_lead} (${lead.nome_empresa})`)
  return id_lead
}

/**
 * Retorna todos os leads atribuídos ao membro (coluna P = membro_responsavel).
 */
export async function getLeadsByMember(email: string): Promise<LeadMaster[]> {
  await ensureLeadsMasterTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${TAB}'!A:${LAST_COL}`,
    }),
  )

  const rows = (res.data.values ?? []) as string[][]
  const emailLow = email.toLowerCase().trim()

  return rows
    .slice(1) // skip header
    .filter(row => (row[15] ?? '').toLowerCase().trim() === emailLow)
    .map(rowToLead)
}

/**
 * Retorna todos os leads da Leads_Master (para uso admin).
 */
export async function getAllLeads(): Promise<LeadMaster[]> {
  await ensureLeadsMasterTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${TAB}'!A:${LAST_COL}`,
    }),
  )

  const rows = (res.data.values ?? []) as string[][]
  return rows.slice(1).filter(row => row[0]).map(rowToLead)
}
