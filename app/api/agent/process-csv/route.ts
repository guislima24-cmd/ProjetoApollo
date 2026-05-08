import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { analyzeCsvLead } from '@/lib/agent/source-ai-analysis-csv'
import { saveCsvLead } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const memberTab = session.user.memberTab

  const body = await req.json() as {
    nome:          string
    setor?:        string | null
    cidade?:       string | null
    funcionarios?: string | null
    website?:      string | null
    linkedin_url?: string | null
    telefone?:     string | null
    email?:        string | null
    website_text?: string | null
    linkedin_text?: string | null
  }

  if (!body.nome) {
    return Response.json({ error: 'nome é obrigatório' }, { status: 400 })
  }

  let analysis: Awaited<ReturnType<typeof analyzeCsvLead>> = null
  try {
    analysis = await analyzeCsvLead({
      nome:          body.nome,
      setor:         body.setor,
      cidade:        body.cidade,
      funcionarios:  body.funcionarios,
      website:       body.website,
      linkedin_url:  body.linkedin_url,
      website_text:  body.website_text,
      linkedin_text: body.linkedin_text,
    })
  } catch (err) {
    console.error('[process-csv] Gemini error:', err)
  }

  let rowNum: number | null = null
  try {
    rowNum = await saveCsvLead({
      empresa:            body.nome,
      setor:              body.setor,
      cidade:             body.cidade,
      funcionarios:       body.funcionarios,
      website:            body.website,
      linkedin_url:       body.linkedin_url,
      telefone:           body.telefone,
      email:              body.email,
      potencial:          analysis?.potencial          ?? null,
      score_fit:          analysis?.score_fit           ?? null,
      justificativa:      analysis?.justificativa       ?? null,
      dores_tipicas:      analysis?.dores_tipicas       ?? [],
      servicos_sugeridos: analysis?.servicos_sugeridos  ?? [],
      melhor_canal:       analysis?.melhor_canal         ?? null,
      argumento_abertura: analysis?.argumento_abertura  ?? null,
      memberTab,
    })
  } catch (err) {
    console.error('[process-csv] Sheets error:', err)
  }

  const lead = {
    nome:               body.nome,
    setor:              body.setor              ?? null,
    cidade:             body.cidade             ?? null,
    funcionarios:       body.funcionarios       ?? null,
    website:            body.website            ?? null,
    linkedin_url:       body.linkedin_url       ?? null,
    telefone:           body.telefone           ?? null,
    email:              body.email              ?? null,
    potencial:          analysis?.potencial          ?? null,
    score_fit:          analysis?.score_fit           ?? null,
    justificativa:      analysis?.justificativa       ?? null,
    dores_tipicas:      analysis?.dores_tipicas       ?? [],
    servicos_sugeridos: analysis?.servicos_sugeridos  ?? [],
    melhor_canal:       analysis?.melhor_canal         ?? null,
    argumento_abertura: analysis?.argumento_abertura  ?? null,
    ok:                 !!analysis,
  }

  return Response.json({ ok: true, lead, row_number: rowNum })
}
