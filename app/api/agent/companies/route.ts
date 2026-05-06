import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { searchCompanies } from '@/lib/sources/brasil-io'

export const dynamic = 'force-dynamic'

const MAX_COMPANIES = 20

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

  if (!setor)          return Response.json({ error: 'Parâmetro setor obrigatório' },   { status: 400 })
  if (!regioes.length) return Response.json({ error: 'Parâmetro regioes obrigatório' }, { status: 400 })

  try {
    const raw = await searchCompanies({ setor, regioes, portes, limite })

    const companies = raw.map(c => ({
      nome:     c.nome_fantasia || c.razao_social,
      cnpj:     c.cnpj,
      setor:    c.cnae_fiscal_descricao ?? setor,
      porte:    c.porte_empresa         ?? '',
      cidade:   c.municipio,
      email:    c.email,
      telefone: c.telefone,
    }))

    return Response.json({ ok: true, companies })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao buscar empresas' },
      { status: 500 }
    )
  }
}
