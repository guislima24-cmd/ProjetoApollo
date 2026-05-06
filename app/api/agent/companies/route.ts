import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { mapSectorToCNAE, mapRegiao } from '@/lib/sources/brasil-io'

export const dynamic = 'force-dynamic'

const MAX_COMPANIES = 20

const PORTE_MAP: Record<string, string> = {
  MEI:    'MEI',
  ME:     'MICRO EMPRESA',
  EPP:    'EMPRESA DE PEQUENO PORTE',
  MEDIO:  'DEMAIS',
  GRANDE: 'DEMAIS',
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const token = process.env.BRASIL_IO_TOKEN
  if (!token) {
    return Response.json({ ok: false, error: 'BRASIL_IO_TOKEN não configurado.' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const setor   = searchParams.get('setor')    ?? ''
  const regioes = searchParams.getAll('regioes')
  const portes  = searchParams.getAll('portes')
  const limite  = Math.min(Number(searchParams.get('limite') ?? 20), MAX_COMPANIES)

  if (!setor)          return Response.json({ error: 'Parâmetro setor obrigatório' },   { status: 400 })
  if (!regioes.length) return Response.json({ error: 'Parâmetro regioes obrigatório' }, { status: 400 })

  const cnaeCodes  = mapSectorToCNAE(setor)
  const perRegiao  = Math.ceil(limite / Math.max(regioes.length, 1))
  const results: unknown[] = []
  const seenCnpj   = new Set<string>()
  let lastError: string | null = null

  for (const regiao of regioes) {
    if (results.length >= limite) break

    const municipio = mapRegiao(regiao)
    const url = new URL('https://brasil.io/api/dataset/socios-brasil/empresas/data/')
    url.searchParams.set('municipio',          municipio)
    url.searchParams.set('situacao_cadastral', 'ATIVA')
    url.searchParams.set('page_size',          String(Math.min(perRegiao, 50)))
    url.searchParams.set('format',             'json')

    if (cnaeCodes.length > 0) {
      url.searchParams.set('cnae_fiscal', cnaeCodes[0])
    } else {
      url.searchParams.set('search', setor)
    }

    if (portes.length > 0 && PORTE_MAP[portes[0]]) {
      url.searchParams.set('porte_empresa', PORTE_MAP[portes[0]])
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Token ${token}`,
          'User-Agent':  'ProspectAI/1.0 (UFABC Junior)',
        },
        signal: AbortSignal.timeout(7_000),
      })

      if (!res.ok) {
        console.error(`[agent/companies] ${res.status} para "${municipio}"`)
        continue
      }

      const data = await res.json() as { results?: Record<string, unknown>[] }

      for (const c of data.results ?? []) {
        if (results.length >= limite) break
        const cnpj = String(c.cnpj ?? '')
        if (!cnpj || seenCnpj.has(cnpj)) continue
        seenCnpj.add(cnpj)

        const nome = (c.nome_fantasia as string) || (c.razao_social as string) || ''
        if (!nome) continue

        results.push({
          nome,
          cnpj,
          setor:    (c.cnae_fiscal_descricao as string) ?? setor,
          porte:    (c.porte_empresa as string)          ?? '',
          cidade:   municipio,
          email:    (c.email as string | null)           ?? null,
          telefone: (c.telefone1 as string | null)       ?? null,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      console.error(`[agent/companies] Fetch error para "${municipio}":`, msg)
      lastError = msg
    }
  }

  if (!results.length) {
    return Response.json({ ok: false, error: lastError ?? 'Nenhuma empresa encontrada com esses filtros.' })
  }

  return Response.json({ ok: true, companies: results })
}
