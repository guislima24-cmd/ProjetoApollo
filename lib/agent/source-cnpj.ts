// Standalone — não importa de lib/sources/brasil-io.ts

const CNAE_PREFIX_MAP: Record<string, string> = {
  'ti':               '62',
  'tecnologia':       '62',
  'construção civil': '41',
  'construção':       '41',
  'educação':         '85',
  'saúde':            '86',
  'varejo':           '47',
  'logística':        '49',
  'indústria':        '28',
  'alimentação':      '56',
  'consultoria':      '70',
  'marketing':        '73',
  'financeiro':       '64',
  'imobiliário':      '68',
  'jurídico':         '69',
  'contabilidade':    '69',
}

const PORTE_API_MAP: Record<string, string> = {
  'MEI':    'MEI',
  'ME':     'MICRO EMPRESA',
  'EPP':    'EMPRESA DE PEQUENO PORTE',
  'MEDIO':  'EMPRESA DE MÉDIO PORTE',
  'GRANDE': 'EMPRESA DE GRANDE PORTE',
}

export interface AgentCompany {
  nome:     string
  cnpj:     string
  setor:    string
  porte:    string
  cidade:   string
  email:    string | null
  telefone: string | null
}

export async function searchCompaniesForAgent(params: {
  setor:   string
  regioes: string[]
  portes:  string[]
  limite:  number
}): Promise<AgentCompany[]> {
  const token = process.env.BRASIL_IO_TOKEN
  if (!token) throw new Error('BRASIL_IO_TOKEN não configurado.')

  const cnaePrefix = CNAE_PREFIX_MAP[params.setor.toLowerCase().trim()] ?? ''
  const limit = Math.min(params.limite, 100)
  const results: AgentCompany[] = []
  const seenCnpj = new Set<string>()

  for (const regiao of params.regioes.slice(0, 5)) {
    if (results.length >= limit) break

    const url = new URL('https://brasil.io/api/dataset/socios-brasil/empresas/data/')
    url.searchParams.set('municipio', regiao.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
    if (cnaePrefix) url.searchParams.set('cnae_fiscal__startswith', cnaePrefix)
    if (params.portes.length === 1) {
      const mappedPorte = PORTE_API_MAP[params.portes[0]] ?? params.portes[0]
      url.searchParams.set('porte_empresa', mappedPorte)
    }
    url.searchParams.set('page_size', String(Math.min(limit - results.length, 50)))

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Token ${token}`,
          Accept:        'application/json',
        },
      })

      if (!res.ok) continue

      const data = await res.json() as { results?: Record<string, unknown>[] }

      for (const c of data.results ?? []) {
        const cnpj = String(c.cnpj ?? '')
        if (!cnpj || seenCnpj.has(cnpj)) continue
        seenCnpj.add(cnpj)

        const nome = (c.nome_fantasia as string) || (c.razao_social as string) || ''
        if (!nome) continue

        results.push({
          nome,
          cnpj,
          setor:    (c.cnae_fiscal_descricao as string) ?? params.setor,
          porte:    (c.porte_empresa as string)          ?? '',
          cidade:   (c.municipio as string)              ?? regiao,
          email:    (c.email as string | null)           ?? null,
          telefone: (c.telefone as string | null)        ?? null,
        })

        if (results.length >= limit) break
      }
    } catch {
      // Continua para próxima região em caso de erro
    }
  }

  return results
}
