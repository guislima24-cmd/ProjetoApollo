/**
 * Fonte 1: Brasil.io — busca de empresas por CNPJ aberto.
 *
 * API escolhida: https://brasil.io/api/dataset/socios-brasil/empresas/data/
 * Motivo: único endpoint público gratuito com filtro por municipio + CNAE + porte.
 * Requer token gratuito: https://brasil.io/api-token/
 *
 * Enriquecimento de campos faltantes (email, telefone) via CNPJ.ws:
 *   https://publica.cnpj.ws/cnpj/{cnpj}  —  sem autenticação, sem rate limit declarado.
 */

export interface RawCompany {
  razao_social: string
  nome_fantasia: string | null
  cnpj: string
  municipio: string
  uf: string
  cnae_fiscal: string
  cnae_fiscal_descricao: string | null
  porte_empresa: string | null
  email: string | null
  telefone: string | null
  situacao_cadastral: string
}

// ── Mapeamento setor amigável → prefixos de 4 dígitos CNAE ───────────────────

export const CNAE_MAP: Record<string, string[]> = {
  'indústria química':         ['2010', '2021', '2029', '2031', '2032'],
  'química':                   ['2010', '2021', '2029', '2031', '2032'],
  'construção civil':          ['4110', '4120', '4211', '4212'],
  'construção':                ['4110', '4120', '4211', '4212'],
  'ti':                        ['6201', '6202', '6203', '6204', '6209'],
  'software':                  ['6201', '6202', '6203', '6204', '6209'],
  'tecnologia da informação':  ['6201', '6202', '6203', '6204', '6209'],
  'tecnologia':                ['6201', '6202', '6203', '6204', '6209'],
  'manufatura':                ['2800', '2900', '3000', '2500'],
  'indústria':                 ['2800', '2900', '3000', '2500'],
  'saúde':                     ['8610', '8621', '8622', '8630'],
  'educação':                  ['8511', '8512', '8513', '8520'],
  'consultoria':               ['7020', '6910', '6920'],
  'alimentos':                 ['1011', '1012', '1031', '1091', '1099'],
}

// ── Mapeamento região → nome do município no Brasil.io (sem acento, maiúsculo) ─

const MUNICIPIO_MAP: Record<string, string> = {
  'santo andré':           'SANTO ANDRE',
  'são bernardo':          'SAO BERNARDO DO CAMPO',
  'são bernardo do campo': 'SAO BERNARDO DO CAMPO',
  'são caetano':           'SAO CAETANO DO SUL',
  'são caetano do sul':    'SAO CAETANO DO SUL',
  'mauá':                  'MAUA',
  'ribeirão pires':        'RIBEIRAO PIRES',
  'diadema':               'DIADEMA',
  'são paulo capital':     'SAO PAULO',
  'são paulo':             'SAO PAULO',
}

// ── Mapeamento porte → valor no Brasil.io ────────────────────────────────────

const PORTE_MAP: Record<string, string> = {
  'MEI':         'MEI',
  'ME':          'MICRO EMPRESA',
  'EPP':         'EMPRESA DE PEQUENO PORTE',
  'Médio porte': 'DEMAIS',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function mapSectorToCNAE(setor: string): string[] {
  const norm = setor.toLowerCase().trim()
  for (const [key, codes] of Object.entries(CNAE_MAP)) {
    if (norm.includes(key) || key.includes(norm)) return codes
  }
  return []
}

export function mapRegiao(regiao: string): string {
  return MUNICIPIO_MAP[regiao.toLowerCase().trim()] ?? regiao.toUpperCase()
}

function formatCNPJ(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 14
    ? `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`
    : raw
}

// ── Enriquecimento individual via CNPJ.ws (sem autenticação) ─────────────────

async function enrichFromCnpjWs(cnpj: string): Promise<{ email: string | null; telefone: string | null }> {
  const digits = cnpj.replace(/\D/g, '')
  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, {
      headers: { 'User-Agent': 'ProspectAI/1.0 (UFABC Junior)' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return { email: null, telefone: null }
    const data = await res.json()
    const email   = data.estabelecimento?.email ?? null
    const ddd     = data.estabelecimento?.ddd1 ?? ''
    const fone    = data.estabelecimento?.telefone1 ?? ''
    const telefone = ddd && fone ? `(${ddd}) ${fone}` : null
    return { email, telefone }
  } catch {
    return { email: null, telefone: null }
  }
}

// ── Busca principal ───────────────────────────────────────────────────────────

export async function searchCompanies(params: {
  setor: string
  regioes: string[]
  portes: string[]
  limite: number
}): Promise<RawCompany[]> {
  const token = process.env.BRASIL_IO_TOKEN
  if (!token) {
    throw new Error(
      'BRASIL_IO_TOKEN não configurado. Obtenha gratuitamente em https://brasil.io/api-token/ ' +
      'e adicione ao .env.local como BRASIL_IO_TOKEN=seu_token_aqui'
    )
  }

  const cnaeCodes = mapSectorToCNAE(params.setor)
  const results: RawCompany[] = []
  const perRegiao = Math.ceil(params.limite / Math.max(params.regioes.length, 1))

  for (const regiao of params.regioes) {
    const municipio = mapRegiao(regiao)
    const url = new URL('https://brasil.io/api/dataset/socios-brasil/empresas/data/')
    url.searchParams.set('municipio',           municipio)
    url.searchParams.set('situacao_cadastral',  'ATIVA')
    url.searchParams.set('page_size',           String(Math.min(perRegiao, 100)))
    url.searchParams.set('format',              'json')

    if (cnaeCodes.length > 0) {
      // Brasil.io aceita prefixo de CNAE via parâmetro direto (string match)
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
          'User-Agent': 'ProspectAI/1.0 (UFABC Junior)',
        },
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[brasil.io] ${res.status} para "${municipio}":`, errText.slice(0, 300))
        continue
      }

      const data = await res.json()
      const items = ((data.results ?? []) as Record<string, unknown>[])
        .filter(item => String(item.situacao_cadastral ?? '') === 'ATIVA' && item.cnpj)
        .map(item => ({
          razao_social:          String(item.razao_social ?? ''),
          nome_fantasia:         item.nome_fantasia ? String(item.nome_fantasia) : null,
          cnpj:                  formatCNPJ(String(item.cnpj ?? '')),
          municipio:             String(item.municipio ?? ''),
          uf:                    String(item.uf ?? 'SP'),
          cnae_fiscal:           String(item.cnae_fiscal ?? ''),
          cnae_fiscal_descricao: item.cnae_fiscal_descricao ? String(item.cnae_fiscal_descricao) : null,
          porte_empresa:         item.porte_empresa ? String(item.porte_empresa) : null,
          email:                 item.email ? String(item.email) : null,
          telefone:              item.telefone1 ? String(item.telefone1) : null,
          situacao_cadastral:    'ATIVA',
        } satisfies RawCompany))

      // Enriquece campos faltantes via CNPJ.ws (apenas os que não têm email/tel)
      for (const item of items) {
        if (!item.email && !item.telefone) {
          const enriched = await enrichFromCnpjWs(item.cnpj)
          item.email    = enriched.email
          item.telefone = enriched.telefone
        }
      }

      results.push(...items)
    } catch (err) {
      console.error(`[brasil.io] Falha para "${municipio}":`, err)
    }
  }

  return results.slice(0, params.limite)
}
