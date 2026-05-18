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

const TAB               = 'Leads_Master'
const INACTIVE_STATUSES = new Set<LeadStatus>(['respondeu', 'descartado'])
const DEDUP_DAYS        = 90

// Só bloqueia reimport se uma ação já foi tomada com o decisor.
// 'enriquecido' = importado mas não contatado → pode reimportar sem problema.
const DEDUP_BLOCK_STATUSES = new Set<LeadStatus>([
  'conexao_enviada', 'conexao_aceita',
  'mensagem_enviada', 'followup_1_enviado', 'followup_2_enviado', 'respondeu',
])

// ── Snapshot da Leads_Master ──────────────────────────────────────────────────

interface MasterSnapshot {
  existingEmails:    Set<string>          // emails de decisores já cadastrados (90 dias)
  existingLinkedins: Set<string>          // LinkedIn URLs de decisores já cadastrados (90 dias)
  empresaMembro:     Map<string, string>  // empresa → email do membro responsável (todos os tempos)
  activeCounts:      Map<string, number>  // membro → nº de empresas ativas distintas
}

export async function getMasterSnapshot(): Promise<MasterSnapshot> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${TAB}'!B:R`,  // B=nome_empresa, K=linkedin_decisor, L=email_decisor, O=data_importacao, P=membro, R=status
    }),
  )

  const rows = (res.data.values ?? []) as string[][]
  const cutoff = Date.now() - DEDUP_DAYS * 86_400_000

  const existingEmails    = new Set<string>()
  const existingLinkedins = new Set<string>()
  const empresaMembro     = new Map<string, string>()
  const activeCounts      = new Map<string, number>()
  const empresasPorMembro = new Map<string, Set<string>>()

  for (const m of MEMBERS_DISTRIBUTION) {
    activeCounts.set(m.email, 0)
    empresasPorMembro.set(m.email, new Set())
  }

  for (const row of rows.slice(1)) {
    const nomeEmpresa      = (row[0]  ?? '').toLowerCase().trim()  // B
    const linkedinDecisora = (row[9]  ?? '').toLowerCase().trim()  // K
    const emailDecisora    = (row[10] ?? '').toLowerCase().trim()  // L
    const dataImport       = row[13]  ?? ''                        // O
    const membro           = (row[14] ?? '').toLowerCase().trim()  // P
    const status           = (row[16] ?? '') as LeadStatus         // R

    // Dedup: só bloqueia reimport se uma ação já foi tomada com o decisor.
    // 'enriquecido' = importado mas nunca contatado → não bloqueia.
    if (dataImport && DEDUP_BLOCK_STATUSES.has(status)) {
      const ts = new Date(dataImport).getTime()
      if (!isNaN(ts) && ts > cutoff) {
        if (emailDecisora)    existingEmails.add(emailDecisora)
        if (linkedinDecisora) existingLinkedins.add(linkedinDecisora)
      }
    }

    // Empresa → membro: sem cutoff, para reutilizar o mesmo membro em novos decisores da empresa
    if (nomeEmpresa && membro) empresaMembro.set(nomeEmpresa, membro)

    // Capacidade: conta empresas ativas distintas por membro
    if (membro && nomeEmpresa && !INACTIVE_STATUSES.has(status)) {
      const set = empresasPorMembro.get(membro) ?? new Set<string>()
      set.add(nomeEmpresa)
      empresasPorMembro.set(membro, set)
    }
  }

  for (const [membro, empresas] of empresasPorMembro) {
    activeCounts.set(membro, empresas.size)
  }

  return { existingEmails, existingLinkedins, empresaMembro, activeCounts }
}

// ── Deduplicação por decisor ──────────────────────────────────────────────────

export function isDecissorDuplicate(email: string, linkedin: string, snapshot: MasterSnapshot): boolean {
  const e = email.toLowerCase().trim()
  const l = linkedin.toLowerCase().trim()
  if (e && snapshot.existingEmails.has(e))    return true
  if (l && snapshot.existingLinkedins.has(l)) return true
  return false
}

// ── Algoritmo de distribuição por empresa ────────────────────────────────────

export function getOrAssignMember(nomeEmpresa: string, snapshot: MasterSnapshot): string | null {
  const empresa = nomeEmpresa.toLowerCase().trim()

  // Empresa já tem membro atribuído → reutiliza sem incrementar capacidade
  const existing = snapshot.empresaMembro.get(empresa)
  if (existing) return existing

  // Nova empresa → distribui para o membro ativo com menor carga.
  // Sem limite de capacidade — sempre atribui a alguém.
  const ativos = MEMBERS_DISTRIBUTION.filter(m => m.ativo)
  if (!ativos.length) return null

  ativos.sort(
    (a, b) => (snapshot.activeCounts.get(a.email) ?? 0) - (snapshot.activeCounts.get(b.email) ?? 0),
  )

  const chosen = ativos[0].email
  snapshot.activeCounts.set(chosen, (snapshot.activeCounts.get(chosen) ?? 0) + 1)
  snapshot.empresaMembro.set(empresa, chosen)
  return chosen
}
