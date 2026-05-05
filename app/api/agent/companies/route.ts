import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { searchCompaniesForAgent } from '@/lib/agent/source-cnpj'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const setor   = searchParams.get('setor')    ?? ''
  const regioes = searchParams.getAll('regioes')
  const portes  = searchParams.getAll('portes')
  const limite  = Math.min(Number(searchParams.get('limite') ?? 20), MAX_COMPANIES)

  if (!setor)           return Response.json({ error: 'Parâmetro setor obrigatório' }, { status: 400 })
  if (!regioes.length)  return Response.json({ error: 'Parâmetro regioes obrigatório' }, { status: 400 })

  try {
    const companies = await searchCompaniesForAgent({ setor, regioes, portes, limite })
    return Response.json({ ok: true, companies })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao buscar empresas' },
      { status: 500 }
    )
  }
}

const MAX_COMPANIES = 20
