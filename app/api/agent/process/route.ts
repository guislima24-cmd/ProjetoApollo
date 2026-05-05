import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { analyzeCompanyForAgent } from '@/lib/agent/source-ai-analysis'
import { findEmailsForAgent, extractDomain } from '@/lib/agent/source-email'
import { saveAgentLead, logUsage } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const memberTab = session.user.memberTab

  const body = await req.json() as {
    nome:          string
    cnpj:          string
    setor:         string
    porte:         string
    cidade:        string
    email?:        string | null
    telefone?:     string | null
    linkedin_url?: string | null
    followers?:    string | null
    industry?:     string | null
  }

  if (!body.nome) {
    return Response.json({ error: 'Campo nome obrigatório' }, { status: 400 })
  }

  // IA + email em paralelo
  const [analysis, emails] = await Promise.all([
    analyzeCompanyForAgent({
      nome:      body.nome,
      setor:     body.setor,
      porte:     body.porte,
      cidade:    body.cidade,
      industry:  body.industry,
      followers: body.followers,
    }),
    findEmailsForAgent(
      extractDomain(body.linkedin_url ?? body.email ?? '')
    ),
  ])

  // Salva no Sheets sem bloquear a resposta
  saveAgentLead({
    empresa:            body.nome,
    cnpj:               body.cnpj,
    setor:              body.setor,
    porte:              body.porte,
    cidade:             body.cidade,
    email:              body.email ?? emails[0]?.email ?? null,
    telefone:           body.telefone,
    linkedin_url:       body.linkedin_url,
    followers:          body.followers,
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

  return Response.json({ ok: true, analysis, emails })
}
