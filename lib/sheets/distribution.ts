import { getSheets, getSpreadsheetId, withRetry } from './client'
import { MEMBERS_DISTRIBUTION } from '@/lib/members.config'
import type { ApolloRow } from '@/lib/csv-parser'
import type { LeadMaster, LeadStatus } from '@/lib/types/lead'

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

// ── Insere lote de leads com distribuição ─────────────────────────────────────

export interface ImportSummary {
  total:       number
  atribuidos:  number
  duplicados:  number
  sem_vaga:    number
  por_membro:  Record<string, number>
}

export async function distributeLeads(
  rows:     ApolloRow[],
  snapshot: MasterSnapshot,
): Promise<ImportSummary> {
  const { insertLead } = await import('./leads-master')

  const summary: ImportSummary = {
    total:      rows.length,
    atribuidos: 0,
    duplicados: 0,
    sem_vaga:   0,
    por_membro: {},
  }

  const now = new Date().toISOString()

  for (const row of rows) {
    if (isDuplicate(row, snapshot)) {
      summary.duplicados++
      continue
    }

    const membro = pickMember(snapshot)
    if (!membro) {
      // Insere como nao_atribuido
      await insertLead({
        ...apolloRowToLead(row, '', now),
        status:            'nao_atribuido',
        membro_responsavel: '',
        data_atribuicao:   '',
      })
      summary.sem_vaga++
      continue
    }

    await insertLead(apolloRowToLead(row, membro, now))
    summary.atribuidos++
    summary.por_membro[membro] = (summary.por_membro[membro] ?? 0) + 1

    // Atualiza existingKeys para dedup intra-lote
    if (row.nome_empresa)  snapshot.existingKeys.add(`empresa:${row.nome_empresa.toLowerCase().trim()}`)
    if (row.email_decisor) snapshot.existingKeys.add(`email:${row.email_decisor.toLowerCase().trim()}`)
  }

  return summary
}

function apolloRowToLead(
  row:    ApolloRow,
  membro: string,
  now:    string,
): Omit<LeadMaster, 'id_lead'> {
  return {
    nome_empresa:             row.nome_empresa,
    setor:                    row.setor,
    porte:                    row.porte,
    cidade:                   row.cidade,
    estado:                   row.estado,
    site:                     row.site,
    linkedin_empresa:         row.linkedin_empresa,
    nome_decisor:             row.nome_decisor,
    cargo_decisor:            row.cargo_decisor,
    linkedin_decisor:         row.linkedin_decisor,
    email_decisor:            row.email_decisor,
    telefone_decisor:         row.telefone_decisor,
    fonte:                    'apollo_csv',
    data_importacao:          now,
    membro_responsavel:       membro,
    data_atribuicao:          membro ? now : '',
    status:                   'nao_contatado',
    data_ultima_acao:         '',
    data_proxima_acao:        '',
    tentativas_followup:      0,
    nota_conexao:             '',
    mensagem_boas_vindas:     '',
    followup_1:               '',
    followup_2:               '',
    gancho_personalizado:     '',
    justificativa_ia:         '',
    observacoes:              '',
    link_conversa_linkedin:   '',
    ultima_mensagem_recebida: '',
    data_resposta:            '',
    data_descartado:          '',
  }
}
