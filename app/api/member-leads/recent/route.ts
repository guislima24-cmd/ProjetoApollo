import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromRequest } from '@/lib/auth'
import { getRecentLeadsFromMemberTab } from '@/lib/sheets'

/**
 * GET /api/member-leads/recent?n=10
 * Retorna os últimos N leads da aba do membro logado (mais recente primeiro).
 */

export async function GET(req: NextRequest) {
  try {
    const responsavel = await getMemberFromRequest(req)
    if (!responsavel) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const nParam = req.nextUrl.searchParams.get('n')
    let n = 10
    if (nParam) {
      const parsed = parseInt(nParam, 10)
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 50) n = parsed
    }

    const leads = await getRecentLeadsFromMemberTab(responsavel, n)
    return NextResponse.json({ responsavel, leads })
  } catch (error) {
    console.error('Erro em /api/member-leads/recent:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Erro interno', detalhe: message },
      { status: 500 }
    )
  }
}
