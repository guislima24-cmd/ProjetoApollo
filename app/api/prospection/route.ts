/**
 * POST /api/prospection — registra prospecção na aba do membro logado.
 * GET  /api/prospection — retorna prospecções recentes do membro logado.
 *
 * Aceita autenticação via:
 *   1. Cookie de sessão NextAuth (navegador / popup da extensão)
 *   2. Header X-Session-Token (background service worker da extensão,
 *      que não tem acesso ao cookie store do browser)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { verifyToken } from '@/lib/extension-auth'
import { appendProspection, getRecentProspections } from '@/lib/sheets'
import type { ProspectionRecord } from '@/types'

async function getMemberTab(req: NextRequest): Promise<string | null> {
  // 1. Sessão NextAuth (browser / popup da extensão)
  const session = await auth()
  if (session?.user?.memberTab) return session.user.memberTab

  // 2. Header X-Session-Token (background service worker)
  const token = req.headers.get('X-Session-Token')
  if (token) return verifyToken(token)

  return null
}

export async function POST(req: NextRequest) {
  const memberTab = await getMemberTab(req)
  if (!memberTab) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: ProspectionRecord
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body.nome || !body.empresa || !body.canal) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: nome, empresa, canal' },
      { status: 400 }
    )
  }

  try {
    const rowIndex = await appendProspection(memberTab, body)
    return NextResponse.json({ ok: true, rowIndex, memberTab })
  } catch (err) {
    console.error('[prospection POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao registrar' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const memberTab = await getMemberTab(req)
  if (!memberTab) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    const prospections = await getRecentProspections(memberTab, 20)
    return NextResponse.json({ prospections })
  } catch (err) {
    console.error('[prospection GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao buscar prospecções' },
      { status: 500 }
    )
  }
}
