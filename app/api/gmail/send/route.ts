/**
 * POST /api/gmail/send
 *
 * Envia um email via Gmail API usando a conta do membro logado
 * e registra automaticamente na planilha como prospecção (canal: Email).
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendGmailMessage } from '@/lib/gmail'
import { appendProspection } from '@/lib/sheets'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab || !session.accessToken) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: {
    to: string
    subject: string
    message: string
    nome: string
    empresa: string
    cargo?: string
    setor?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body.to || !body.subject || !body.message) {
    return NextResponse.json({ error: 'to, subject e message são obrigatórios' }, { status: 400 })
  }

  try {
    // 1. Envia o email via Gmail API
    const { messageId, threadId } = await sendGmailMessage(session.accessToken, {
      to: body.to,
      subject: body.subject,
      body: body.message,
      fromName: session.user.name ?? session.user.memberTab,
    })

    // 2. Registra na planilha automaticamente
    const rowIndex = await appendProspection(session.user.memberTab, {
      nome: body.nome,
      empresa: body.empresa,
      cargo: body.cargo ?? '',
      setor: body.setor ?? '',
      canal: 'Email',
      contato: body.to,
      mensagem_ia: body.message,
    })

    return NextResponse.json({ ok: true, messageId, threadId, rowIndex })
  } catch (err) {
    console.error('[gmail/send]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao enviar email' },
      { status: 500 }
    )
  }
}
