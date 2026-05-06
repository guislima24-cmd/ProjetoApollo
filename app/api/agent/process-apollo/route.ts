import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { analyzeCompanyForApollo } from '@/lib/agent/source-ai-analysis-apollo'
import { findEmailsForAgent, extractDomain } from '@/lib/agent/source-email'
import { parseWebsiteData } from '@/lib/agent/source-website'
import { saveApolloLead, logUsage } from '@/lib/sheets'
import { mapRegiao } from '@/lib/sources/brasil-io'

export const dynamic = 'force-dynamic'

interface DecisionMaker {
  name:        string
  role:        string
  profile_url: string | null
}

interface ProcessApolloBody {
  company_name:    string
  website?:        string | null
  apollo_url?:     string | null
  linkedin_url?:   string | null
  sector?:         string | null
  employees?:      string | null
  location?:       string | null
  phone?:          string | null
  website_text?:   string | null
  decision_makers?: DecisionMaker[]
  setor_filtro?:   string
  portes?:         string[]
}

async function enrichWithBrasilIo(companyName: string, location: string): Promise<{
  cnpj: string | null
  email: string | null
  telefone: string | null
  porte: string | null
} | null> {
  const token = (process.env.BRASIL_IO_TOKEN ?? '').replace(/^﻿/, '').trim()
  if (!token) return null

  const rawCity  = location.split(',')[0].trim()
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

  const body = await req.json() as ProcessApolloBody

  if (!body.company_name) {
    return Response.json({ error: 'Campo company_name obrigatório' }, { status: 400 })
  }

  const location    = body.location    ?? ''
  const setor       = body.setor_filtro ?? body.sector ?? ''
  const linkedinUrl = body.linkedin_url ?? null
  const website     = body.website      ?? null

  // Parse website text if provided
  const websiteData = body.website_text ? parseWebsiteData(body.website_text) : null

  // Map employees string to porte label
  const funcionarios = body.employees ?? null
  const porteLabel   = body.portes?.[0] ?? ''

  // AI analysis + emails in parallel; Brasil.io enrichment if location available
  const [brasilio, analysis, emails] = await Promise.all([
    location ? enrichWithBrasilIo(body.company_name, location) : Promise.resolve(null),
    analyzeCompanyForApollo({
      nome:         body.company_name,
      setor,
      porte:        porteLabel,
      cidade:       location,
      website:      website,
      funcionarios: funcionarios,
      resumo_site:  websiteData?.summary ?? null,
    }),
    findEmailsForAgent(
      extractDomain(linkedinUrl ?? website ?? '')
    ),
  ])

  const cnpj       = brasilio?.cnpj     ?? null
  const email      = brasilio?.email    ?? websiteData?.emails[0] ?? emails[0]?.email ?? null
  const telefone   = body.phone         ?? brasilio?.telefone     ?? websiteData?.phones[0] ?? null
  const porte      = brasilio?.porte    ?? porteLabel             ?? null
  const resumoSite = websiteData?.summary ?? null

  const allEmails = [
    ...(email ? [email] : []),
    ...emails.map(e => e.email),
    ...(websiteData?.emails ?? []),
  ].filter((e, i, arr) => e && arr.indexOf(e) === i)

  saveApolloLead({
    empresa:             body.company_name,
    website:             website,
    setor,
    porte,
    funcionarios,
    cidade:              location,
    email,
    telefone,
    linkedin_url:        linkedinUrl,
    apollo_url:          body.apollo_url ?? null,
    decision_makers:     body.decision_makers ?? [],
    emails_encontrados:  allEmails,
    cnpj,
    potencial:           analysis?.potencial          ?? null,
    justificativa:       analysis?.justificativa       ?? null,
    dores_tipicas:       analysis?.dores_tipicas       ?? [],
    servicos_sugeridos:  analysis?.servicos_sugeridos  ?? [],
    argumento_abertura:  analysis?.argumento_abertura  ?? null,
    score_fit:           analysis?.score_fit           ?? null,
    resumo_site:         resumoSite,
    status:              'Descoberto pelo Apollo',
    memberTab,
  }).catch(err => console.error('[agent/process-apollo] Sheets error:', err))

  logUsage({ memberTab, acao: 'apollo_lead' })

  return Response.json({
    ok: true,
    cnpj,
    email,
    telefone,
    porte,
    analysis,
    emails: allEmails,
    resumo_site: resumoSite,
  })
}
