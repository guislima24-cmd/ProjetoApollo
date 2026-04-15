import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromRequest } from '@/lib/auth'

/**
 * GET /api/auth/me
 * Retorna { responsavel } se houver sessão válida, 401 caso contrário.
 */
export async function GET(req: NextRequest) {
  const responsavel = await getMemberFromRequest(req)
  if (!responsavel) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  return NextResponse.json({ responsavel })
}
