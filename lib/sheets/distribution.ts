import { MEMBERS_DISTRIBUTION, getEmailByTabName } from '@/lib/members.config'
import { readLeadsCSV, parseDecisores } from './leads-csv'

// Para capacidade: slot ocupado = empresa com membro atribuído e ainda não finalizada.
// Uma empresa conta como ativa enquanto membro estiver na col R e prospectado não cobriu todos os decisores.
const DEDUP_DAYS = 90

// ── Snapshot da Leads CSV ─────────────────────────────────────────────────────

interface MasterSnapshot {
  existingEmails:    Set<string>          // emails de decisores já cadastrados (90 dias)
  existingLinkedins: Set<string>          // LinkedIn URLs de decisores já cadastrados (90 dias)
  empresaMembro:     Map<string, string>  // empresa (lower) → email canônico do membro
  activeCounts:      Map<string, number>  // email membro → nº de empresas com membro atribuído
}

export async function getMasterSnapshot(): Promise<MasterSnapshot> {
  const rows   = await readLeadsCSV()
  const cutoff = Date.now() - DEDUP_DAYS * 86_400_000

  const existingEmails    = new Set<string>()
  const existingLinkedins = new Set<string>()
  const empresaMembro     = new Map<string, string>()
  const activeCounts      = new Map<string, number>()

  for (const m of MEMBERS_DISTRIBUTION) {
    activeCounts.set(m.email, 0)
  }

  for (const lead of rows) {
    const nomeEmpresa = lead.empresa.toLowerCase().trim()
    const membroTab   = lead.membro.trim()

    // Dedup por LinkedIn URL dos decisores (col Q)
    if (lead.decisores_linkedin) {
      const ts = lead.data_prospeccao
        ? new Date(lead.data_prospeccao.split('/').reverse().join('-')).getTime()
        : NaN
      const dentroJanela = isNaN(ts) || ts > cutoff

      if (dentroJanela && lead.prospectado) {
        // Só bloqueia decisores que já foram prospectados
        const tentados    = lead.prospectado.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        const decisores   = parseDecisores(lead.decisores_linkedin)
        for (const idx of tentados) {
          const d = decisores[idx]
          if (d?.url) existingLinkedins.add(d.url.toLowerCase().trim())
        }
      }
    }

    // Dedup por email da empresa (col I) como fallback grosso
    if (lead.email) {
      const ts = lead.data_prospeccao
        ? new Date(lead.data_prospeccao.split('/').reverse().join('-')).getTime()
        : NaN
      const dentroJanela = isNaN(ts) || ts > cutoff
      if (dentroJanela && lead.prospectado) {
        existingEmails.add(lead.email.toLowerCase().trim())
      }
    }

    // Empresa → membro: converte tab name → email canônico
    if (nomeEmpresa && membroTab) {
      const membroEmail = getEmailByTabName(membroTab)
      if (membroEmail) {
        empresaMembro.set(nomeEmpresa, membroEmail)

        // Conta como slot ativo enquanto empresa tiver membro (independente de status)
        activeCounts.set(membroEmail, (activeCounts.get(membroEmail) ?? 0) + 1)
      }
    }
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
