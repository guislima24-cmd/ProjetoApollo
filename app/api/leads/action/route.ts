import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { updateLeadStatus } from '@/lib/sheets/lead-status'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'
import { appendProspection, incrementContactCount } from '@/lib/sheets'
import { getTabByEmail } from '@/lib/members.config'
import type { LeadStatus } from '@/lib/types/lead'

export const dynamic = 'force-dynamic'

const TAB = 'Leads_Master'

const NEXT_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  enriquecido:        'conexao_enviada',
  conexao_aceita:     'mensagem_enviada',
  mensagem_enviada:   'followup_1_enviado',
  followup_1_enviado: 'followup_2_enviado',
  followup_2_enviado: 'followup_3_enviado',
  followup_3_enviado: 'followup_4_enviado',
  followup_4_enviado: 'followup_5_enviado',
}

async function getCurrentStatus(leadId: string): Promise<LeadStatus | null> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const colA = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:R` }),
  )
  const rows = (colA.data.values ?? []) as string[][]
  const row = rows.find((r, i) => i > 0 && r[0] === leadId)
  return row ? (row[17] ?? null) as LeadStatus : null
}


async function adiararLead(leadId: string): Promise<void> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const colA = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:A` }),
  )
  const ids = (colA.data.values ?? []) as string[][]
  const idx = ids.findIndex((r, i) => i > 0 && r[0] === leadId)
  if (idx === -1) return

  const sheetRow = idx + 1
  const amanha   = new Date()
  amanha.setDate(amanha.getDate() + 1)

  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `'${TAB}'!T${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:      { values: [[amanha.toISOString()]] },
    }),
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const email = session.user.email

  const { lead_id, action, mensagem, campo_mensagem } = await req.json() as {
    lead_id:        string
    action:         'enviar' | 'pular' | 'descartar'
    mensagem?:      string
    campo_mensagem?: string  // qual coluna salvar mensagem editada
  }

  if (!lead_id || !action) {
    return Response.json({ error: 'lead_id e action são obrigatórios' }, { status: 400 })
  }

  try {
    if (action === 'pular') {
      await adiararLead(lead_id)
      return Response.json({ ok: true })
    }

    if (action === 'descartar') {
      await updateLeadStatus(lead_id, 'descartado', email)
      return Response.json({ ok: true })
    }

    if (action === 'enviar') {
      const currentStatus = await getCurrentStatus(lead_id)
      if (!currentStatus) {
        return Response.json({ error: 'Lead não encontrado' }, { status: 404 })
      }

      // REGRA: leads que responderam nunca recebem followup automático
      if (currentStatus === 'respondeu') {
        return Response.json({ error: 'Este lead já respondeu — continue a conversa diretamente no LinkedIn' }, { status: 400 })
      }
      if (currentStatus === 'descartado') {
        return Response.json({ error: 'Lead descartado — não é possível enviar mensagens' }, { status: 400 })
      }

      const nextStatus = NEXT_STATUS[currentStatus]
      if (!nextStatus) {
        return Response.json({ error: `Status ${currentStatus} não tem próximo estado para envio` }, { status: 400 })
      }

      await updateLeadStatus(lead_id, nextStatus, email)

      // Preenche aba individual do membro (conexao_enviada) e incrementa coluna J (pitch/followups)
      const INCREMENTA_J: LeadStatus[] = [
        'mensagem_enviada',
        'followup_1_enviado', 'followup_2_enviado',
        'followup_3_enviado', 'followup_4_enviado', 'followup_5_enviado',
      ]
      const precisaLerRow = nextStatus === 'conexao_enviada' || INCREMENTA_J.includes(nextStatus)
      if (precisaLerRow) {
        const memberTab = getTabByEmail(email)
        if (memberTab) {
          try {
            const spreadsheetId = getSpreadsheetId()
            const sheets = getSheets()
            const colsRes = await withRetry(() =>
              sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:K` }),
            )
            const rows = (colsRes.data.values ?? []) as string[][]
            const leadRow = rows.find((r, i) => i > 0 && r[0] === lead_id)
            if (leadRow) {
              const nomeEmpresa     = leadRow[1]  ?? ''  // B
              const setor           = leadRow[2]  ?? ''  // C
              const nomeDecisoa     = leadRow[8]  ?? ''  // I
              const linkedinDecisoa = leadRow[10] ?? ''  // K

              if (nextStatus === 'conexao_enviada') {
                await appendProspection(memberTab, {
                  nome:    nomeDecisoa,
                  empresa: nomeEmpresa,
                  canal:   'LinkedIn',
                  setor,
                  contato: linkedinDecisoa,
                }).catch(() => {})
              }

              if (INCREMENTA_J.includes(nextStatus)) {
                await incrementContactCount(memberTab, nomeEmpresa, nomeDecisoa).catch(() => {})
              }
            }
          } catch { /* não bloqueia o fluxo principal */ }
        }
      }

      return Response.json({ ok: true, novo_status: nextStatus })
    }

    return Response.json({ error: 'action inválida' }, { status: 400 })
  } catch (err) {
    console.error('[leads/action]', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
