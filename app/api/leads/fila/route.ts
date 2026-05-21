import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getTabByEmail } from '@/lib/members.config'
import { readLeadsCSV, parseDecisores, parseTentados } from '@/lib/sheets/leads-csv'
import { readAllFromTab } from '@/lib/sheets/member-tab'
import { updateLeadStatusInTab } from '@/lib/sheets/lead-status'
import { MESSAGE_TEMPLATES } from '@/lib/templates/messages'
import type { LeadStatus } from '@/lib/types/lead'
import type { FilaCard } from '@/lib/types/fila'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

const FOLLOWUP_STATUSES = new Set<LeadStatus>([
  'conexao_aceita',
  'mensagem_enviada',
  'followup_1_enviado',
  'followup_2_enviado',
  'followup_3_enviado',
  'followup_4_enviado',
  'followup_5_enviado',
])

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const email     = session.user.email
  const memberTab = getTabByEmail(email)
  if (!memberTab) {
    return Response.json({ conexoes: [], followups: [], totais: { conexoes: 0, followups: 0 } })
  }

  let allCSV: Awaited<ReturnType<typeof readLeadsCSV>>
  let memberLeads: Awaited<ReturnType<typeof readAllFromTab>>

  try {
    ;[allCSV, memberLeads] = await Promise.all([
      readLeadsCSV(),
      readAllFromTab(memberTab),
    ])
  } catch (err) {
    console.error('[fila] Sheets error:', err)
    return Response.json({ conexoes: [], followups: [], totais: { conexoes: 0, followups: 0 } })
  }

  // Filtra CSV pelas empresas deste membro
  const myCSV = allCSV.filter(csv => csv.membro === memberTab)

  // Índice: URL do decisor → linha da aba do membro
  const urlToRow = new Map<string, typeof memberLeads[0]>()
  for (const ml of memberLeads) {
    if (ml.numero_link) {
      urlToRow.set(ml.numero_link.toLowerCase().trim(), ml)
    }
  }

  const conexoes: FilaCard[] = []
  const followups: FilaCard[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const csv of myCSV) {
    const decisores = parseDecisores(csv.decisores_linkedin)
    const tentados  = parseTentados(csv.prospectado)

    if (decisores.length === 0) continue

    // Cascade: menor índice ainda não tentado
    let activeIdx = -1
    let activeDecisor: { nome: string; url: string } | null = null
    for (let i = 0; i < decisores.length; i++) {
      if (!tentados.includes(i)) {
        activeIdx = i
        activeDecisor = decisores[i]
        break
      }
    }
    if (!activeDecisor) continue

    // Busca linha existente na aba do membro pela URL do decisor
    const memberLead = activeDecisor.url
      ? urlToRow.get(activeDecisor.url.toLowerCase().trim())
      : undefined

    const status = memberLead?.sys_status ?? 'nao_contatado'

    // Ignora terminais e aguardando aceitação
    if (status === 'respondeu' || status === 'descartado') continue
    if (status === 'conexao_enviada') continue

    const card: FilaCard = {
      id:               memberLead?.sys_id || `new_${csv.rowIndex}_${activeIdx}`,
      sysId:            memberLead?.sys_id ?? '',
      csvRowIndex:      csv.rowIndex,
      decisorIdx:       activeIdx,
      sheetRow:         memberLead?.sheetRow ?? null,
      empresa:          csv.empresa,
      setor:            csv.setor,
      cidade:           csv.cidade,
      website:          csv.website,
      linkedin_empresa: csv.linkedin_url,
      potencial:        csv.potencial,
      argumento:        csv.argumento_abertura,
      dores:            csv.dores_tipicas,
      servicos:         csv.servicos_sugeridos,
      decisorNome:      activeDecisor.nome,
      decisorUrl:       activeDecisor.url,
      status,
      tentativas:       parseInt(memberLead?.sys_tentativas ?? '0', 10) || 0,
      templatePitch:    memberLead?.sys_template_pitch ?? 'pitch_longo',
      proximaAcao:      memberLead?.sys_data_proxima_acao ?? '',
      kSugestao:        memberLead?.sys_k_sugestao ?? '',
      observacoes:      memberLead?.observacoes ?? '',
    }

    if (status === 'nao_contatado' || status === 'enriquecido') {
      conexoes.push(card)
    } else if (FOLLOWUP_STATUSES.has(status)) {
      if (!card.proximaAcao) continue
      const proxima = new Date(card.proximaAcao)
      proxima.setHours(0, 0, 0, 0)
      if (proxima > today) continue

      // Skip automático: followup_2 vazio → avança para followup_3
      if (status === 'followup_1_enviado' && !MESSAGE_TEMPLATES.followup_2.trim()) {
        if (card.sysId) {
          try {
            await updateLeadStatusInTab(
              card.sysId, memberTab, 'followup_2_enviado',
              'followup_2 pulado — template vazio',
            )
          } catch (err) {
            console.error('[fila] skip followup_2 error:', err)
          }
        }
        continue
      }

      followups.push(card)
    }
  }

  return Response.json({
    conexoes:  conexoes.slice(0, PAGE_SIZE),
    followups: followups.slice(0, PAGE_SIZE),
    totais:    { conexoes: conexoes.length, followups: followups.length },
  })
}
