import { getSheets, getSpreadsheetId, withRetry } from './client'
import { MEMBERS_DISTRIBUTION } from '@/lib/members.config'
import type { LeadStatus } from '@/lib/types/lead'

export interface ApolloRow {
  nome_empresa:     string
  setor:            string
  porte:            string
  cidade:           string
  estado:           string
  site:             string
  linkedin_empresa: string
  nome_decisor:     string
  cargo_decisor:    string
  linkedin_decisor: string
  email_decisor:    string
  telefone_decisor: string
}

const TAB                = 'Leads_Master'
const INACTIVE_STATUSES  = new Set<LeadStatus>(['respondeu', 'descartado'])
const DEDUP_DAYS         = 90

// ── Lê colunas-chave da Leads_Master de uma vez ───────────────────────────────

interface MasterSnapshot {
  // Para dedup: Set de "nome_empresa|email_decisor" e datas
  existingKeys: Set<string>
  // Para capacity: mapa email → contagem ativa
  activeCounts: Map<string, number>
}

export async function getMasterSnapshot(): Promise<MasterSnapshot> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${TAB}'!B:R`,  // B=nome_empresa, L=email_decisor, O=data_importacao, P=membro, R=status
    }),
  )

  const rows = (res.data.values ?? []) as string[][]
  const cutoff = Date.now() - DEDUP_DAYS * 86_400_000

  const existingKeys = new Set<string>()
  const activeCounts = new Map<string, number>()

  // Inicializa membros com 0
  for (const m of MEMBERS_DISTRIBUTION) activeCounts.set(m.email, 0)

  for (const row of rows.slice(1)) {
    // Colunas relativas ao range B:R (índice 0 = B)
    const nomeEmpresa   = (row[0]  ?? '').toLowerCase().trim()  // B
    const emailDecisora = (row[10] ?? '').toLowerCase().trim()  // L (offset B=0, L=10)
    const dataImport    = row[13]  ?? ''                        // O (offset 13)
    const membro        = (row[14] ?? '').toLowerCase().trim()  // P (offset 14)
    const status        = (row[16] ?? '') as LeadStatus         // R (offset 16)

    // Dedup: registra empresas importadas nos últimos 90 dias
    if (dataImport) {
      const ts = new Date(dataImport).getTime()
      if (!isNaN(ts) && ts > cutoff) {
        if (nomeEmpresa)   existingKeys.add(`empresa:${nomeEmpresa}`)
        if (emailDecisora) existingKeys.add(`email:${emailDecisora}`)
      }
    }

    // Capacidade: conta leads ativos por membro
    if (membro && !INACTIVE_STATUSES.has(status)) {
      activeCounts.set(membro, (activeCounts.get(membro) ?? 0) + 1)
    }
  }

  return { existingKeys, activeCounts }
}

// ── Deduplicação ──────────────────────────────────────────────────────────────

export function isDuplicate(row: ApolloRow, snapshot: MasterSnapshot): boolean {
  const { existingKeys } = snapshot
  const nome  = row.nome_empresa.toLowerCase().trim()
  const email = row.email_decisor.toLowerCase().trim()
  if (nome  && existingKeys.has(`empresa:${nome}`))  return true
  if (email && existingKeys.has(`email:${email}`))   return true
  return false
}

// ── Algoritmo de distribuição ─────────────────────────────────────────────────

export interface DistributionResult {
  membro_responsavel: string
  nome:               string
}

export function pickMember(snapshot: MasterSnapshot): string | null {
  const ativos = MEMBERS_DISTRIBUTION.filter(m => m.ativo)
  const disponiveis = ativos.filter(
    m => (snapshot.activeCounts.get(m.email) ?? 0) < m.capacidade_semanal,
  )
  if (!disponiveis.length) return null

  // Menor carga → desempate pela ordem em MEMBERS_DISTRIBUTION
  disponiveis.sort(
    (a, b) => (snapshot.activeCounts.get(a.email) ?? 0) - (snapshot.activeCounts.get(b.email) ?? 0),
  )

  const chosen = disponiveis[0].email
  // Atualiza snapshot in-memory para próximas iterações do mesmo lote
  snapshot.activeCounts.set(chosen, (snapshot.activeCounts.get(chosen) ?? 0) + 1)
  return chosen
}

