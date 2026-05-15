import { getSheets, getSpreadsheetId, withRetry } from './client'
import { supabase } from '@/lib/supabase'
import type { LeadStatus } from '@/lib/types/lead'

const TAB = 'Leads_Master'

// ── Matriz de transições válidas ──────────────────────────────────────────────

const VALID_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  nao_atribuido:      ['nao_contatado'],
  nao_contatado:      ['enriquecido', 'descartado'],
  enriquecido:        ['conexao_enviada'],
  conexao_enviada:    ['conexao_aceita', 'descartado'],
  conexao_aceita:     ['mensagem_enviada'],
  mensagem_enviada:   ['followup_1_enviado', 'respondeu'],
  followup_1_enviado: ['followup_2_enviado', 'respondeu'],
  followup_2_enviado: ['respondeu', 'descartado'],
  respondeu:              [],
  descartado:             [],
  erro_enriquecimento:    ['nao_contatado'],  // permite retentar
}

export function isValidTransition(from: LeadStatus, to: LeadStatus): boolean {
  // Qualquer status pode ir para 'respondeu' se reply for detectado
  if (to === 'respondeu') return from !== 'respondeu' && from !== 'descartado'
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// ── data_proxima_acao por status ───────────────────────────────────────────────

function isoFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function getDataProximaAcao(status: LeadStatus): string {
  switch (status) {
    case 'enriquecido':        return isoFromNow(0)
    case 'conexao_aceita':     return isoFromNow(0)
    case 'mensagem_enviada':   return isoFromNow(3)
    case 'followup_1_enviado': return isoFromNow(5)
    case 'followup_2_enviado': return isoFromNow(7)
    default:                   return ''  // null — aguarda evento externo
  }
}

// ── Localiza lead por id na aba ────────────────────────────────────────────────

async function findLeadRow(
  leadId: string,
): Promise<{ sheetRow: number; currentStatus: LeadStatus } | null> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const colA = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:A` }),
  )
  const ids = (colA.data.values ?? []) as string[][]
  const idx = ids.findIndex((row, i) => i > 0 && (row[0] ?? '') === leadId)
  if (idx === -1) return null

  const sheetRow = idx + 1  // 1-based
  const statusRes = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${TAB}'!R${sheetRow}:R${sheetRow}`,
    }),
  )
  const currentStatus = (statusRes.data.values?.[0]?.[0] ?? 'nao_atribuido') as LeadStatus

  return { sheetRow, currentStatus }
}

// ── updateLeadStatus ──────────────────────────────────────────────────────────

export async function updateLeadStatus(
  leadId:            string,
  newStatus:         LeadStatus,
  membroResponsavel: string,
): Promise<void> {
  const found = await findLeadRow(leadId)
  if (!found) throw new Error(`Lead não encontrado: ${leadId}`)

  const { sheetRow, currentStatus } = found

  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(
      `Transição inválida: ${currentStatus} → ${newStatus}`,
    )
  }

  const now        = new Date().toISOString()
  const proximaAcao = getDataProximaAcao(newStatus)

  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  // Atualiza colunas R (status), S (data_ultima_acao), T (data_proxima_acao)
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `'${TAB}'!R${sheetRow}:T${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [[newStatus, now, proximaAcao]] },
    }),
  )

  // Log no Supabase
  const { error } = await supabase()
    .from('activity_log')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      lead_id:            leadId,
      status_anterior:    currentStatus,
      status_novo:        newStatus,
      membro_responsavel: membroResponsavel,
      timestamp:          now,
    } as any)

  if (error) {
    console.error('[lead-status] Supabase log error:', error.message)
    // Não relança — falha de log não deve bloquear a atualização de status
  }

  console.log(`[lead-status] ${leadId}: ${currentStatus} → ${newStatus} (${membroResponsavel})`)
}

// ── getStatusHistory ──────────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id:                 string
  lead_id:            string
  status_anterior:    string | null
  status_novo:        string
  membro_responsavel: string
  timestamp:          string
}

export async function getStatusHistory(leadId: string): Promise<ActivityLogEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase().from('activity_log') as any)
    .select('*')
    .eq('lead_id', leadId)
    .order('timestamp', { ascending: true })

  if (error) throw new Error(`Supabase error: ${error.message}`)
  return (data ?? []) as ActivityLogEntry[]
}
