import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSentEmails } from '@/lib/gmail'
import { getRecentProspections, updateProspectionStatus } from '@/lib/sheets'
import { google } from 'googleapis'

function getGmailClient(accessToken: string) {
  const oauth2 = new google.auth.OAuth2()
  oauth2.setCredentials({ access_token: accessToken })
  return google.gmail({ version: 'v1', auth: oauth2 })
}

/**
 * POST — varre emails enviados e retorna leads detectados (para confirmação manual)
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab || !session.accessToken) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const hours: number = body.hours ?? 24

  try {
    const sentEmails = await getSentEmails(session.accessToken, hours)
    return NextResponse.json({ leads: sentEmails, total: sentEmails.length })
  } catch (err) {
    console.error('[gmail/sync POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao sincronizar Gmail' },
      { status: 500 }
    )
  }
}

/**
 * GET — verifica respostas recebidas de leads com status "Aguardando"
 * e atualiza o status na planilha para "Respondeu" automaticamente.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.memberTab || !session.accessToken) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const memberTab = session.user.memberTab
  const gmail = getGmailClient(session.accessToken)

  try {
    const prospections = await getRecentProspections(memberTab, 100)
    const aguardando = prospections.filter(
      p => p.status === 'Aguardando' && p.contato?.includes('@')
    )

    const updated: number[] = []

    for (const p of aguardando) {
      const email = p.contato!.trim()
      try {
        // Converte dataEnvio (dd/mm/yyyy) para timestamp Unix para o filtro after:
        const afterTimestamp = (() => {
          const parts = (p.dataEnvio ?? '').split('/')
          if (parts.length === 3) {
            const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`)
            return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000)
          }
          return 0
        })()

        const query = afterTimestamp > 0
          ? `from:${email} in:inbox after:${afterTimestamp}`
          : `from:${email} in:inbox`

        const res = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 1,
        })
        if ((res.data.messages ?? []).length > 0) {
          const dataResposta = new Date().toLocaleDateString('pt-BR')
          await updateProspectionStatus(memberTab, p.rowIndex, 'Respondeu', dataResposta)
          updated.push(p.rowIndex)
        }
      } catch {
        // Ignora erro individual — continua para o próximo lead
      }
    }

    return NextResponse.json({
      checked: aguardando.length,
      updated,
      message: `${aguardando.length} verificados, ${updated.length} atualizados para "Respondeu"`,
    })
  } catch (err) {
    console.error('[gmail/sync GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao verificar respostas' },
      { status: 500 }
    )
  }
}

/**
 * PATCH — atualiza status de uma prospecção específica (usado pela extensão Chrome)
 */
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { rowIndex, status } = await req.json()
  if (!rowIndex || !status) {
    return NextResponse.json({ error: 'rowIndex e status obrigatórios' }, { status: 400 })
  }

  try {
    const dataResposta = status === 'Respondeu'
      ? new Date().toLocaleDateString('pt-BR')
      : undefined
    await updateProspectionStatus(session.user.memberTab, rowIndex, status, dataResposta)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao atualizar status' },
      { status: 500 }
    )
  }
}
