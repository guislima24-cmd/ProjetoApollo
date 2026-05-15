import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { analyzeCsvLead } from '@/lib/agent/source-ai-analysis-csv'
import { saveCsvLead } from '@/lib/sheets'
import { enrichLinkedInLead } from '@/lib/agent/enrich-linkedin-lead'
import { ensureLeadsMasterTab } from '@/lib/sheets/leads-master'
import { getMasterSnapshot, isDecissorDuplicate, getOrAssignMember } from '@/lib/sheets/distribution'
import { insertLead } from '@/lib/sheets/leads-master'

export const dynamic = 'force-dynamic'

interface Employee { name: string; role: string; profile_url: string | null }

const DECISOR_PRIORITY = [
  'ceo', 'president', 'founder', 'owner', 'diretor', 'director',
  'cto', 'coo', 'cfo', 'head', 'gerente geral', 'sócio', 'partner', 'gerente',
]

function pickDecisionMaker(employees: Employee[]): Employee | null {
  if (!employees.length) return null
  for (const keyword of DECISOR_PRIORITY) {
    const match = employees.find(e => e.role.toLowerCase().includes(keyword))
    if (match) return match
  }
  return employees[0]
}

function splitCidadeEstado(cidade: string | null): { cidade: string; estado: string } {
  if (!cidade) return { cidade: '', estado: '' }
  const parts = cidade.split(',').map(s => s.trim())
  return { cidade: parts[0] ?? '', estado: parts[1] ?? '' }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const memberTab = session.user.memberTab

  const body = await req.json() as {
    nome:                string
    setor?:              string | null
    cidade?:             string | null
    funcionarios?:       string | null
    website?:            string | null
    linkedin_url?:       string | null
    telefone?:           string | null
    email?:              string | null
    website_text?:       string | null
    linkedin_text?:      string | null
    linkedin_employees?: Employee[] | null
  }

  if (!body.nome) {
    return Response.json({ error: 'nome é obrigatório' }, { status: 400 })
  }

  const linkedin_employees = body.linkedin_employees ?? []

  // ── Análise IA existente ───────────────────────────────────────────────────
  let analysis: Awaited<ReturnType<typeof analyzeCsvLead>> = null
  try {
    analysis = await analyzeCsvLead({
      nome:               body.nome,
      setor:              body.setor,
      cidade:             body.cidade,
      funcionarios:       body.funcionarios,
      website:            body.website,
      linkedin_url:       body.linkedin_url,
      website_text:       body.website_text,
      linkedin_text:      body.linkedin_text,
      linkedin_employees,
    })
  } catch (err) {
    console.error('[process-csv] Gemini error:', err)
  }

  // ── Salva na aba legada ────────────────────────────────────────────────────
  let rowNum: number | null = null
  try {
    rowNum = await saveCsvLead({
      empresa:             body.nome,
      setor:               body.setor,
      cidade:              body.cidade,
      funcionarios:        body.funcionarios,
      website:             body.website,
      linkedin_url:        body.linkedin_url,
      telefone:            body.telefone,
      email:               body.email,
      potencial:           analysis?.potencial          ?? null,
      score_fit:           analysis?.score_fit           ?? null,
      justificativa:       analysis?.justificativa       ?? null,
      dores_tipicas:       analysis?.dores_tipicas       ?? [],
      servicos_sugeridos:  analysis?.servicos_sugeridos  ?? [],
      melhor_canal:        analysis?.melhor_canal         ?? null,
      argumento_abertura:  analysis?.argumento_abertura  ?? null,
      linkedin_employees,
      memberTab,
    })
  } catch (err) {
    console.error('[process-csv] Sheets (legacy) error:', err)
  }

  // ── Salva no pipeline LinkedIn (Leads_Master) ──────────────────────────────
  try {
    await ensureLeadsMasterTab()
    const snapshot  = await getMasterSnapshot()
    const { cidade, estado } = splitCidadeEstado(body.cidade ?? null)
    const decisor   = pickDecisionMaker(linkedin_employees)

    const apolloRow = {
      nome_empresa:     body.nome,
      setor:            body.setor            ?? '',
      porte:            body.funcionarios      ?? '',
      cidade,
      estado,
      site:             body.website           ?? '',
      linkedin_empresa: body.linkedin_url       ?? '',
      nome_decisor:     decisor?.name           ?? '',
      cargo_decisor:    decisor?.role           ?? '',
      linkedin_decisor: decisor?.profile_url    ?? '',
      email_decisor:    body.email              ?? '',
      telefone_decisor: body.telefone           ?? '',
    }

    if (!isDecissorDuplicate(apolloRow.email_decisor, snapshot)) {
      // Empresa já existente → usa membro anterior; nova empresa → distribui
      const membro = getOrAssignMember(apolloRow.nome_empresa, snapshot) ?? ''

      // Gera mensagens de LinkedIn via IA
      let enrichment = {
        nota_conexao: '', mensagem_pitch: '', followup_1: '',
        followup_2: '', gancho_personalizado: analysis?.argumento_abertura ?? '',
        justificativa_ia: analysis?.justificativa ?? '',
      }
      try {
        const result = await enrichLinkedInLead({
          nome_empresa:  body.nome,
          setor:         body.setor      ?? '',
          porte:         body.funcionarios ?? '',
          cidade,
          estado,
          nome_decisor:  decisor?.name    ?? '',
          cargo_decisor: decisor?.role    ?? '',
        })
        enrichment = result
      } catch (err) {
        console.error('[process-csv] enrichLinkedInLead error:', err)
      }

      const now = new Date().toISOString()
      await insertLead({
        ...apolloRow,
        fonte:                    'apollo_csv',
        data_importacao:          now,
        membro_responsavel:       membro,
        data_atribuicao:          membro ? now : '',
        status:                   'enriquecido',
        data_ultima_acao:         now,
        data_proxima_acao:        '',
        tentativas_followup:      0,
        nota_conexao:             enrichment.nota_conexao,
        mensagem_pitch:     enrichment.mensagem_pitch,
        followup_1:               enrichment.followup_1,
        followup_2:               enrichment.followup_2,
        gancho_personalizado:     enrichment.gancho_personalizado,
        justificativa_ia:         enrichment.justificativa_ia,
        observacoes:              '',
        link_conversa_linkedin:   '',
        ultima_mensagem_recebida: '',
        data_resposta:            '',
        data_descartado:          '',
      })

      // Dedup intra-lote: registra email para não duplicar dentro do mesmo lote
      if (apolloRow.email_decisor) {
        snapshot.existingEmails.add(apolloRow.email_decisor.toLowerCase().trim())
      }
    }
  } catch (err) {
    // Não quebra o fluxo existente — pipeline LinkedIn é best-effort
    console.error('[process-csv] Leads_Master error:', err)
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
    linkedin_employees,
    ok:                 !!analysis,
  }

  return Response.json({ ok: true, lead, row_number: rowNum })
}
