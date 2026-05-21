import type { MemberLead, LeadStatus } from '@/lib/types/lead'
import { getSheets, getSpreadsheetId, withRetry, sanitize } from './client'

const LAST_COL = 'AC'

export function rowToMemberLead(row: string[], sheetRow: number): MemberLead {
  const c = (i: number) => row[i] ?? ''
  return {
    sheetRow,
    alvo:                  c(0),
    mes:                   c(1),
    canal:                 c(2),
    setor:                 c(3),
    empresa:               c(4),
    nome_contato:          c(5),
    numero_link:           c(6),
    quem_respondeu:        c(7),
    data_conexao:          c(8),
    quantos_contatos:      c(9),
    marcou_rd:             c(10),
    data_rd:               c(11),
    no_show:               c(12),
    sql:                   c(13),
    marcou_rp:             c(14),
    data_proposta:         c(15),
    contrato:              c(16),
    data_contrato:         c(17),
    motivo_recusa:         c(18),
    ciclo_conversao:       c(19),
    observacoes:           c(20),
    sys_id:                c(21),
    sys_status:            (c(22) || 'nao_atribuido') as LeadStatus,
    sys_data_ultima_acao:  c(23),
    sys_data_proxima_acao: c(24),
    sys_tentativas:        c(25),
    sys_template_pitch:    c(26),
    sys_leads_csv_row:     c(27),
    sys_k_sugestao:        c(28),
  }
}

export function memberLeadToRow(lead: Omit<MemberLead, 'sheetRow'>): string[] {
  return [
    lead.alvo, lead.mes, lead.canal, lead.setor, lead.empresa,
    lead.nome_contato, lead.numero_link, lead.quem_respondeu, lead.data_conexao,
    lead.quantos_contatos, lead.marcou_rd, lead.data_rd, lead.no_show, lead.sql,
    lead.marcou_rp, lead.data_proposta, lead.contrato, lead.data_contrato,
    lead.motivo_recusa, lead.ciclo_conversao, lead.observacoes,
    lead.sys_id, lead.sys_status, lead.sys_data_ultima_acao, lead.sys_data_proxima_acao,
    lead.sys_tentativas, lead.sys_template_pitch, lead.sys_leads_csv_row, lead.sys_k_sugestao,
  ].map(sanitize)
}

export async function readAllFromTab(tabName: string): Promise<MemberLead[]> {
  const sheets        = getSheets()
  const spreadsheetId = getSpreadsheetId()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:${LAST_COL}`,
    }),
  )

  const rows = (res.data.values ?? []) as string[][]
  return rows
    .slice(1)
    .map((row, i) => rowToMemberLead(row, i + 2))
    .filter(lead => lead.sys_id !== '')
}

export async function findLeadRowInTab(tabName: string, sysId: string): Promise<number | null> {
  const leads = await readAllFromTab(tabName)
  return leads.find(l => l.sys_id === sysId)?.sheetRow ?? null
}

export async function appendMemberTabRow(
  tabName: string,
  lead: Omit<MemberLead, 'sheetRow'>,
): Promise<number> {
  const sheets        = getSheets()
  const spreadsheetId = getSpreadsheetId()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range:            `'${tabName}'!A:${LAST_COL}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody:      { values: [memberLeadToRow(lead)] },
    }),
  )

  const updatedRange = res.data.updates?.updatedRange ?? ''
  const match        = updatedRange.match(/:?[A-Z]+(\d+)$/)
  return match ? parseInt(match[1], 10) : -1
}

export async function updateMemberTabRow(
  tabName:  string,
  sheetRow: number,
  fields:   Partial<Omit<MemberLead, 'sheetRow'>>,
): Promise<void> {
  const sheets        = getSheets()
  const spreadsheetId = getSpreadsheetId()

  const existing = await readAllFromTab(tabName)
  const lead     = existing.find(l => l.sheetRow === sheetRow)
  if (!lead) throw new Error(`Linha ${sheetRow} não encontrada na aba "${tabName}"`)

  const updated = { ...lead, ...fields }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sheetRow: _, ...withoutRow } = updated

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `'${tabName}'!A${sheetRow}:${LAST_COL}${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody:      { values: [memberLeadToRow(withoutRow)] },
    }),
  )
}
