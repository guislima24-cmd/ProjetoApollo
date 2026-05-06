// Standalone — não importa de lib/sources/brasil-io.ts

const CNAE_MAP: Record<string, string[]> = {
  'ti':                       ['6201', '6202', '6203', '6204', '6209'],
  'tecnologia':               ['6201', '6202', '6203', '6204', '6209'],
  'software':                 ['6201', '6202', '6203', '6204', '6209'],
  'construção civil':         ['4110', '4120', '4211', '4212'],
  'construção':               ['4110', '4120', '4211', '4212'],
  'educação':                 ['8511', '8512', '8513', '8520'],
  'saúde':                    ['8610', '8621', '8622', '8630'],
  'varejo':                   ['4711', '4712', '4721', '4722'],
  'logística':                ['4930', '4940', '5211', '5212'],
  'indústria':                ['2800', '2900', '3000', '2500'],
  'alimentação':              ['1011', '1012', '1031', '1091', '1099'],
  'consultoria':              ['7020', '6910', '6920'],
  'marketing':                ['7311', '7312', '7319'],
  'financeiro':               ['6411', '6422', '6431', '6499'],
  'imobiliário':              ['6810', '6821', '6822'],
  'jurídico':                 ['6910'],
  'contabilidade':            ['6920'],
}

const MUNICIPIO_MAP: Record<string, string> = {
  'são paulo':             'SAO PAULO',
  'sao paulo':             'SAO PAULO',
  'são bernardo do campo': 'SAO BERNARDO DO CAMPO',
  'sao bernardo do campo': 'SAO BERNARDO DO CAMPO',
  'são bernardo':          'SAO BERNARDO DO CAMPO',
  'santo andré':           'SANTO ANDRE',
  'santo andre':           'SANTO ANDRE',
  'são caetano do sul':    'SAO CAETANO DO SUL',
  'sao caetano do sul':    'SAO CAETANO DO SUL',
  'são caetano':           'SAO CAETANO DO SUL',
  'diadema':               'DIADEMA',
  'mauá':                  'MAUA',
  'maua':                  'MAUA',
  'ribeirão pires':        'RIBEIRAO PIRES',
  'ribeirao pires':        'RIBEIRAO PIRES',
  'rio grande da serra':   'RIO GRANDE DA SERRA',
  'guarulhos':             'GUARULHOS',
  'campinas':              'CAMPINAS',
  'barueri':               'BARUERI',
  'osasco':                'OSASCO',
}

const PORTE_MAP: Record<string, string> = {
  'MEI':    'MEI',
  'ME':     'MICRO EMPRESA',
  'EPP':    'EMPRESA DE PEQUENO PORTE',
  'MEDIO':  'DEMAIS',
  'GRANDE': 'DEMAIS',
}

function mapMunicipio(regiao: string): string {
  const key = regiao.toLowerCase().trim()
  return MUNICIPIO_MAP[key] ?? regiao.toUpperCase()
}

function mapSetor(setor: string): string[] {
  const norm = setor.toLowerCase().trim()
  for (const [key, codes] of Object.entries(CNAE_MAP)) {
    if (norm.includes(key) || key.includes(norm)) return codes
  }
  return []
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

  const cnaeCodes = mapSetor(params.setor)
  const results: AgentCompany[] = []
  const seenCnpj = new Set<string>()
  const perRegiao = Math.ceil(params.limite / Math.max(params.regioes.length, 1))

  for (const regiao of params.regioes) {
    if (results.length >= params.limite) break

    const municipio = mapMunicipio(regiao)
    const url = new URL('https://brasil.io/api/dataset/socios-brasil/empresas/data/')
    url.searchParams.set('municipio',          municipio)
    url.searchParams.set('situacao_cadastral', 'ATIVA')
    url.searchParams.set('page_size',          String(Math.min(perRegiao, 100)))
    url.searchParams.set('format',             'json')

    if (cnaeCodes.length > 0) {
      url.searchParams.set('cnae_fiscal', cnaeCodes[0])
    } else {
      url.searchParams.set('search', params.setor)
    }

    if (params.portes.length > 0) {
      const mapped = PORTE_MAP[params.portes[0]]
      if (mapped) url.searchParams.set('porte_empresa', mapped)
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Token ${token}`,
          'User-Agent':  'ProspectAI/1.0 (UFABC Junior)',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        console.error(`[agent/cnpj] ${res.status} para "${municipio}"`)
        continue
      }

      const data = await res.json() as { results?: Record<string, unknown>[] }

      for (const c of data.results ?? []) {
        if (results.length >= params.limite) break

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
          cidade:   municipio,
          email:    (c.email as string | null)           ?? null,
          telefone: (c.telefone1 as string | null)       ?? null,
        })
      }
    } catch (err) {
      console.error(`[agent/cnpj] Falha para "${municipio}":`, err)
    }
  }

  return results
}
