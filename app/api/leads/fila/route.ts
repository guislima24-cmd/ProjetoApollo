import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'
import { getCanonicalMemberEmail } from '@/lib/members.config'
import { updateLeadStatus } from '@/lib/sheets/lead-status'
import { MESSAGE_TEMPLATES } from '@/lib/templates/messages'
import type { LeadMaster, LeadStatus } from '@/lib/types/lead'

export const dynamic = 'force-dynamic'

const TAB      = 'Leads_Master'
const LAST_COL = 'AG'
const PAGE_SIZE = 20

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
    fonte:                    (row[13] ?? 'apollo_csv') as LeadMaster['fonte'],
    data_importacao:          row[14] ?? '',
    membro_responsavel:       row[15] ?? '',
    data_atribuicao:          row[16] ?? '',
    status:                   (row[17] ?? 'nao_contatado') as LeadMaster['status'],
    data_ultima_acao:         row[18] ?? '',
    data_proxima_acao:        row[19] ?? '',
    tentativas_followup:      parseInt(row[20] ?? '0', 10) || 0,
    nota_conexao:             row[21] ?? '',
    mensagem_pitch:     row[22] ?? '',
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

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const email = session.user.email ?? ''
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  let res
  try {
    res = await withRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:${LAST_COL}` }),
    )
  } catch (err) {
    console.error('[fila] Sheets error:', err)
    return Response.json({
      conexoes: [], pitch: [], followups: [],
      totais: { conexoes: 0, pitch: 0, followups: 0 },
    })
  }

  const rows    = (res.data.values ?? []) as string[][]
  // Resolve email canônico: guislima24@gmail.com → guilherme.lima@ufabcjr.com.br
  const emailLow = getCanonicalMemberEmail(email)
  const today    = new Date()
  today.setHours(0, 0, 0, 0)

  const FOLLOWUP_STATUSES = new Set<LeadStatus>([
    'mensagem_enviada',
    'followup_1_enviado',
    'followup_2_enviado',
    'followup_3_enviado',
    'followup_4_enviado',
    'followup_5_enviado',
  ])

  const conexoes:  LeadMaster[] = []
  const followups: LeadMaster[] = []

  for (const row of rows.slice(1)) {
    if (!row[0]) continue
    const membro = (row[15] ?? '').toLowerCase().trim()
    if (membro !== emailLow) continue

    const lead   = rowToLead(row)
    const status = lead.status

    if (status === 'enriquecido') {
      conexoes.push(lead)
    } else if (FOLLOWUP_STATUSES.has(status)) {
      if (!lead.data_proxima_acao) continue
      const proxima = new Date(lead.data_proxima_acao)
      proxima.setHours(0, 0, 0, 0)
      if (proxima > today) continue

      // Skip automático: followup_2 vazio → avança direto para followup_3
      if (status === 'followup_1_enviado' && !MESSAGE_TEMPLATES.followup_2.trim()) {
        try {
          await updateLeadStatus(
            lead.id_lead,
            'followup_2_enviado',
            'system',
            'followup_2 pulado — template vazio',
          )
        } catch (err) {
          console.error('[fila] skip followup_2 error:', err)
        }
        continue
      }

      followups.push(lead)
    }
  }

  return Response.json({
    conexoes:  conexoes.slice(0, PAGE_SIZE),
    followups: followups.slice(0, PAGE_SIZE),
    totais: {
      conexoes:  conexoes.length,
      followups: followups.length,
    },
  })
}
