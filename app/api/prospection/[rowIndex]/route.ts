/**
 * PATCH /api/prospection/[rowIndex] — atualiza status de uma prospecção na planilha.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { verifyToken } from '@/lib/extension-auth'
import { updateProspectionStatus } from '@/lib/sheets'
import { isAdmin } from '@/lib/members.config'
import type { ProspectionStatus } from '@/types'

const VALID_STATUSES: ProspectionStatus[] = ['Aguardando', 'Respondeu', 'Reunião', 'Follow-up', 'Descartado']

async function getSessionInfo(req: NextRequest): Promise<{ memberTab: string; role: string } | null> {
  const session = await auth()
  if (session?.user?.memberTab) return { memberTab: session.user.memberTab, role: session.user.role }

  const token = req.headers.get('X-Session-Token')
  if (token) {
    const tab = await verifyToken(token)
    if (tab) return { memberTab: tab, role: 'member' as const }
  }

  return null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ rowIndex: string }> }
) {
  const sessionInfo = await getSessionInfo(req)
  if (!sessionInfo) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { rowIndex: rowIndexStr } = await params
  const rowIndex = parseInt(rowIndexStr)
  if (isNaN(rowIndex) || rowIndex < 2) {
    return NextResponse.json({ error: 'rowIndex inválido' }, { status: 400 })
  }

  let body: { status: ProspectionStatus; dataResposta?: string; memberTab?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `Status deve ser um de: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  // Admin pode atualizar a aba de qualquer membro; membro comum só a sua
  const targetTab = (body.memberTab && isAdmin(sessionInfo.role as any))
    ? body.memberTab
    : sessionInfo.memberTab

  try {
    const dataResposta = body.dataResposta ?? new Date().toLocaleDateString('pt-BR')
    await updateProspectionStatus(targetTab, rowIndex, body.status, dataResposta)
    return NextResponse.json({ ok: true, rowIndex, status: body.status, memberTab: targetTab })
  } catch (err) {
    console.error('[prospection PATCH]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao atualizar' },
      { status: 500 }
    )
  }
}
