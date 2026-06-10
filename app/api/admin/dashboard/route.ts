import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail, MEMBER_TABS, MEMBERS_DISTRIBUTION, getTabByEmail } from '@/lib/members.config'
import { readTabSummary, TabSummaryRow } from '@/lib/sheets/member-tab'
import { readLeadsCSV, parseDecisoresInfo } from '@/lib/sheets/leads-csv'

export const dynamic = 'force-dynamic'

const ACEITAS_STATUS = new Set([
  'conexao_aceita', 'mensagem_enviada',
  'followup_1_enviado', 'followup_2_enviado', 'followup_3_enviado',
  'followup_4_enviado', 'followup_5_enviado', 'respondeu',
])
const COM_MSG_STATUS = new Set([
  'mensagem_enviada',
  'followup_1_enviado', 'followup_2_enviado', 'followup_3_enviado',
  'followup_4_enviado', 'followup_5_enviado', 'respondeu',
])

function parseMes(data_conexao: string): string {
  const p = (data_conexao ?? '').trim().split('/')
  if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1].padStart(2, '0')}`
  const d = (data_conexao ?? '').trim().split('-')
  if (d.length === 3 && d[0].length === 4) return `${d[0]}-${d[1].padStart(2, '0')}`
  return ''
}

function labelMes(yyyyMM: string): string {
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [y, m] = yyyyMM.split('-')
  return `${meses[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

function isAceita(r: TabSummaryRow): boolean {
  if (r.sys_status) return ACEITAS_STATUS.has(r.sys_status)
  return r.marcou_rd !== '' && r.marcou_rd !== 'Aguardando conexão'
}

function isComMsg(r: TabSummaryRow): boolean {
  return COM_MSG_STATUS.has(r.sys_status)
}

function isRespondeu(r: TabSummaryRow): boolean {
  return r.sys_status === 'respondeu'
}

function isRD(r: TabSummaryRow): boolean {
  return r.marcou_rd !== '' && r.marcou_rd !== 'Aguardando conexão'
}

function isContrato(r: TabSummaryRow): boolean {
  return r.contrato !== ''
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return Response.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const url      = new URL(req.url)
  const mesParam = url.searchParams.get('mes')

  // Lê todas as abas dos membros + Leads CSV em paralelo
  const [tabResults, leadsCSV] = await Promise.all([
    Promise.allSettled(
      MEMBER_TABS.map(tab => readTabSummary(tab).then(rows => ({ tab, rows }))),
    ),
    readLeadsCSV().catch(() => [] as Awaited<ReturnType<typeof readLeadsCSV>>),
  ])

  // Agrega todas as linhas com o nome da aba
  const allLeads: Array<TabSummaryRow & { membro: string }> = []
  for (const r of tabResults) {
    if (r.status === 'fulfilled') {
      for (const row of r.value.rows) {
        allLeads.push({ ...row, membro: r.value.tab })
      }
    }
  }

  // Meses disponíveis (do dado mais antigo ao mais recente)
  const mesSet = new Set<string>()
  for (const l of allLeads) {
    const m = parseMes(l.data_conexao)
    if (m) mesSet.add(m)
  }
  const mesesDisponiveis = [...mesSet].sort().reverse()

  const now        = new Date()
  const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const mesSel     = mesParam ?? mesesDisponiveis[0] ?? currentMes

  // Leads do mês selecionado
  const leadsMes = allLeads.filter(l => parseMes(l.data_conexao) === mesSel)

  const conexoes   = leadsMes.length
  const aceitas    = leadsMes.filter(isAceita).length
  const comMsg     = leadsMes.filter(isComMsg).length
  const responderam = leadsMes.filter(isRespondeu).length
  const rds        = leadsMes.filter(isRD).length
  const contratos  = leadsMes.filter(isContrato).length
  const taxaAceitacao = conexoes > 0 ? Math.round(aceitas    / conexoes * 100) : 0
  const taxaResposta  = aceitas  > 0 ? Math.round(responderam / aceitas  * 100) : 0

  const funil = [
    { name: 'Enviadas',   valor: conexoes },
    { name: 'Aceitas',    valor: aceitas },
    { name: 'c/ Mensagem', valor: comMsg },
    { name: 'Responderam', valor: responderam },
    { name: 'RD marcado', valor: rds },
    { name: 'Contrato',   valor: contratos },
  ]

  // Stats por membro no mês selecionado
  const memMap: Record<string, { conexoes: number; aceitas: number; responderam: number; rds: number }> = {}
  for (const tab of MEMBER_TABS) {
    memMap[tab] = { conexoes: 0, aceitas: 0, responderam: 0, rds: 0 }
  }
  for (const l of leadsMes) {
    const s = memMap[l.membro]
    if (!s) continue
    s.conexoes++
    if (isAceita(l))    s.aceitas++
    if (isRespondeu(l)) s.responderam++
    if (isRD(l))        s.rds++
  }
  const porMembro = MEMBER_TABS
    .map(tab => ({ nome: tab, ...memMap[tab] }))
    .filter(m => m.conexoes > 0)

  // Histórico: últimos 6 meses
  const historico = Array.from({ length: 6 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const ls  = allLeads.filter(l => parseMes(l.data_conexao) === key)
    return {
      mes:        labelMes(key),
      conexoes:   ls.length,
      responderam: ls.filter(isRespondeu).length,
    }
  })

  // Lista de membros para a tabela admin (com stats do mês)
  const membros = MEMBERS_DISTRIBUTION.map(m => {
    const tab   = getTabByEmail(m.email) ?? m.nome
    const stats = memMap[tab] ?? { conexoes: 0, aceitas: 0, responderam: 0, rds: 0 }
    return { email: m.email, nome: m.nome, ...stats }
  })

  const pendentesEnriquecimento = leadsCSV.filter(
    l => parseDecisoresInfo(l.decisores_linkedin).status === 'pendente_enriquecimento',
  ).length

  return Response.json({
    mesSelecionado: mesSel,
    mesesDisponiveis,
    conexoes, aceitas, responderam, rds, contratos,
    taxaAceitacao, taxaResposta,
    funil, porMembro, historico, membros,
    pendentesEnriquecimento,
  })
}
