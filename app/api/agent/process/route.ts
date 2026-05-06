import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { analyzeCompanyForAgent } from '@/lib/agent/source-ai-analysis'
import { findEmailsForAgent, extractDomain } from '@/lib/agent/source-email'
import { saveAgentLead, logUsage } from '@/lib/sheets'
import { mapRegiao } from '@/lib/sources/brasil-io'

export const dynamic = 'force-dynamic'

interface DecisionMaker {
  name:        string
  role:        string
  profile_url: string | null
}

interface ProcessBody {
  company_name:    string
  linkedin_url?:   string | null
  sector?:         string | null
  employees_count?: string | null
  location?:       string | null
  description?:    string | null
  recent_posts?:   string[]
  decision_makers?: DecisionMaker[]
  setor_filtro?:   string
  portes?:         string[]
}

// Tenta encontrar CNPJ, email e telefone no Brasil.io pelo nome da empresa + cidade
async function enrichWithBrasilIo(companyName: string, location: string): Promise<{
  cnpj: string | null
  email: string | null
  telefone: string | null
  porte: string | null
} | null> {
  const token = (process.env.BRASIL_IO_TOKEN ?? '').replace(/^﻿/, '').trim()
  if (!token) return null

  // Extrai só a cidade da string de localização do LinkedIn (ex: "São Bernardo do Campo, SP")
  const rawCity = location.split(',')[0].trim()
  const municipio = mapRegiao(rawCity)

  try {
    const url = new URL('https://brasil.io/api/dataset/socios-brasil/empresas/data/')
    url.searchParams.set('search',             companyName)
    url.searchParams.set('municipio',          municipio)
    url.searchParams.set('situacao_cadastral', 'ATIVA')
    url.searchParams.set('page_size',          '5')
    url.searchParams.set('format',             'json')

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Token ${token}`,
        'User-Agent':  'ProspectAI/1.0 (UFABC Junior)',
      },
      signal: AbortSignal.timeout(5_000),
    })

    if (!res.ok) return null

    const data = await res.json() as { results?: Record<string, unknown>[] }
    const first = data.results?.[0]
    if (!first) return null

    return {
      cnpj:     String(first.cnpj     ?? ''),
      email:    (first.email     as string | null) ?? null,
      telefone: (first.telefone1 as string | null) ?? null,
      porte:    (first.porte_empresa as string | null) ?? null,
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const memberTab = session.user.memberTab

  const body = await req.json() as ProcessBody

  if (!body.company_name) {
    return Response.json({ error: 'Campo company_name obrigatório' }, { status: 400 })
  }

  const location    = body.location    ?? ''
  const setor       = body.setor_filtro ?? body.sector ?? ''
  const linkedinUrl = body.linkedin_url ?? null

  // Enriquecimento Brasil.io + análise IA + email em paralelo
  const [brasilio, analysis, emails] = await Promise.all([
    enrichWithBrasilIo(body.company_name, location),
    analyzeCompanyForAgent({
      nome:      body.company_name,
      setor:     setor,
      porte:     '',
      cidade:    location,
      industry:  body.sector    ?? null,
      followers: body.employees_count ?? null,
    }),
    findEmailsForAgent(extractDomain(linkedinUrl ?? '')),
  ])

  const cnpj     = brasilio?.cnpj     ?? null
  const email    = brasilio?.email    ?? emails[0]?.email ?? null
  const telefone = brasilio?.telefone ?? null
  const porte    = brasilio?.porte    ?? null

  // Salva no Sheets sem bloquear a resposta
  saveAgentLead({
    empresa:            body.company_name,
    cnpj:               cnpj,
    setor:              setor,
    porte:              porte,
    cidade:             location,
    email:              email,
    telefone:           telefone,
    linkedin_url:       linkedinUrl,
    decision_makers:    body.decision_makers ?? [],
    potencial:          analysis?.potencial          ?? null,
    justificativa:      analysis?.justificativa       ?? null,
    dores_tipicas:      analysis?.dores_tipicas       ?? [],
    servicos_sugeridos: analysis?.servicos_sugeridos  ?? [],
    argumento_abertura: analysis?.argumento_abertura  ?? null,
    emails_encontrados: emails.map(e => e.email),
    status:             'Descoberto pelo Agente',
    memberTab,
  }).catch(err => console.error('[agent/process] Sheets error:', err))

  logUsage({ memberTab, acao: 'agente_lead' })

  return Response.json({ ok: true, cnpj, email, telefone, porte, analysis, emails })
}
