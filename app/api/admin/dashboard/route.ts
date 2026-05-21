import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail, MEMBERS_DISTRIBUTION } from '@/lib/members.config'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'
import { readLeadsCSV, parseDecisoresInfo } from '@/lib/sheets/leads-csv'
import type { LeadStatus } from '@/lib/types/lead'

export const dynamic = 'force-dynamic'

const TAB = 'Leads_Master'

const ENVIADOS: LeadStatus[] = [
  'conexao_enviada', 'conexao_aceita', 'mensagem_enviada',
  'followup_1_enviado', 'followup_2_enviado', 'respondeu',
]
const PENDENTES_FILA: LeadStatus[] = ['enriquecido', 'conexao_aceita']

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return Response.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  // Lê Leads CSV em paralelo com Leads_Master para o contador de pendentes
  const [res, leadsCSV] = await Promise.all([
    withRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:S` }),
    ),
    readLeadsCSV().catch(() => [] as Awaited<ReturnType<typeof readLeadsCSV>>),
  ])

  const rows    = (res.data.values ?? []) as string[][]
  const data    = rows.slice(1).filter(r => r[0])
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)

  const statusCounts: Record<string, number> = {}
  const membroStats: Record<string, {
    total_ativos:    number
    enviados_semana: number
    responderam:     number
    pendentes_fila:  number
  }> = {}

  for (const m of MEMBERS_DISTRIBUTION) {
    membroStats[m.email] = { total_ativos: 0, enviados_semana: 0, responderam: 0, pendentes_fila: 0 }
  }

  for (const row of data) {
    const status        = (row[17] ?? 'nao_contatado') as LeadStatus
    const email         = (row[15] ?? '').toLowerCase().trim()
    const dataUltimaAcao = row[18] ? new Date(row[18]) : null

    statusCounts[status] = (statusCounts[status] ?? 0) + 1

    const stats = membroStats[email]
    if (!stats) continue

    if (status !== 'descartado') stats.total_ativos++
    if (status === 'respondeu')  stats.responderam++
    if (ENVIADOS.includes(status) && dataUltimaAcao && dataUltimaAcao >= weekAgo) {
      stats.enviados_semana++
    }
    if (PENDENTES_FILA.includes(status)) stats.pendentes_fila++
  }

  const membros = MEMBERS_DISTRIBUTION.map(m => ({
    ...m,
    ...membroStats[m.email],
  }))

  const totalConexaoEnviada =
    (statusCounts['conexao_enviada']      ?? 0) +
    (statusCounts['conexao_aceita']       ?? 0) +
    (statusCounts['mensagem_enviada']     ?? 0) +
    (statusCounts['followup_1_enviado']   ?? 0) +
    (statusCounts['followup_2_enviado']   ?? 0) +
    (statusCounts['respondeu']            ?? 0)

  const totalAceita = totalConexaoEnviada - (statusCounts['conexao_enviada'] ?? 0)
  const taxaAceitacao = totalConexaoEnviada > 0
    ? Math.round((totalAceita / totalConexaoEnviada) * 100) : 0

  const totalComMensagem =
    (statusCounts['mensagem_enviada']   ?? 0) +
    (statusCounts['followup_1_enviado'] ?? 0) +
    (statusCounts['followup_2_enviado'] ?? 0) +
    (statusCounts['respondeu']          ?? 0)

  const taxaResposta = totalComMensagem > 0
    ? Math.round(((statusCounts['respondeu'] ?? 0) / totalComMensagem) * 100) : 0

  const pendentesEnriquecimento = leadsCSV.filter(
    l => parseDecisoresInfo(l.decisores_linkedin).status === 'pendente_enriquecimento',
  ).length

  return Response.json({
    statusCounts,
    membros,
    taxaAceitacao,
    taxaResposta,
    totalLeads: data.length,
    pendentesEnriquecimento,
  })
}
