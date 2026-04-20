import { NextRequest, NextResponse } from 'next/server'
import { appendLeadToMemberTab, MemberTabNotFoundError, updateMensagemIA } from '@/lib/sheets'
import { getMemberFromRequest } from '@/lib/auth'
import { buildPipelineSystemPrompt } from '@/lib/promptBuilder'
import { MemberLead } from '@/types'

/**
 * POST /api/member-leads
 *
 * Protegido pelo middleware — só chega aqui com cookie JWT válido. O campo
 * `responsavel` vem SEMPRE do cookie (nunca do body): impede que um membro
 * grave na aba de outro forjando o payload.
 *
 * Fluxo:
 *   1. Insere linha na aba do membro (colunas A-G) via `appendLeadToMemberTab`.
 *   2. Gera pitch personalizado via Claude.
 *   3. Escreve o pitch na coluna V da linha inserida.
 */

export async function POST(req: NextRequest) {
  try {
    const responsavel = await getMemberFromRequest(req)
    if (!responsavel) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as MemberLead | null
    if (!body) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const { nome, empresa, setor, canal, email, linkedin_url, alvo } = body

    if (!nome || !empresa) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: nome, empresa' },
        { status: 400 }
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
    }

    const missingSheetsEnv: string[] = []
    const hasJsonCred = Boolean(process.env.GOOGLE_CREDENTIALS_JSON)
    if (!hasJsonCred) {
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) missingSheetsEnv.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
      if (!process.env.GOOGLE_PRIVATE_KEY) missingSheetsEnv.push('GOOGLE_PRIVATE_KEY')
    }
    if (!process.env.GOOGLE_SHEETS_ID && !process.env.GOOGLE_MEMBER_SHEETS_ID) {
      missingSheetsEnv.push('GOOGLE_SHEETS_ID ou GOOGLE_MEMBER_SHEETS_ID')
    }
    if (missingSheetsEnv.length > 0) {
      return NextResponse.json(
        { error: `Variáveis de ambiente ausentes: ${missingSheetsEnv.join(', ')}` },
        { status: 500 }
      )
    }

    const lead: MemberLead = { nome, empresa, setor, canal, email, linkedin_url, alvo }

    // 1. Insere linha na aba do membro
    let rowIndex: number
    try {
      rowIndex = await appendLeadToMemberTab(responsavel, lead)
    } catch (e) {
      if (e instanceof MemberTabNotFoundError) {
        // Mismatch entre nome configurado em lib/members.ts e aba real na planilha.
        // 400 (não 500) porque é erro de configuração, não falha transitória.
        return NextResponse.json(
          {
            error: e.message,
            responsavel: e.responsavel,
            abasDisponiveis: e.availableTabs,
            dica: 'Atualize MEMBER_TABS em lib/members.ts para bater com os nomes reais das abas. Use GET /api/member-leads/debug para ver o diff.',
          },
          { status: 400 }
        )
      }
      throw e
    }

    // 2. Gera mensagem com Claude
    const canalStr = canal ?? (linkedin_url ? 'LinkedIn' : 'E-mail')
    const userPrompt = `Escreva uma mensagem de prospecção ${canalStr === 'LinkedIn' ? 'para LinkedIn' : 'por e-mail'} para:

- Nome: ${nome}
- Empresa: ${empresa}
- Setor: ${setor ?? 'Não informado'}
${linkedin_url ? `- LinkedIn: ${linkedin_url}` : ''}
${email ? `- E-mail: ${email}` : ''}

A mensagem deve parecer escrita por um humano que pesquisou esse lead especificamente.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: buildPipelineSystemPrompt(),
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.error?.message ?? 'Erro na API do Claude' },
        { status: response.status }
      )
    }

    const claudeData = await response.json()
    const mensagem: string = claudeData.content[0]?.text ?? ''

    // 3. Salva mensagem na coluna V da linha inserida
    if (rowIndex > 0) {
      await updateMensagemIA(responsavel, rowIndex, mensagem)
    }

    return NextResponse.json({ mensagem, responsavel, rowIndex })
  } catch (error) {
    console.error('Erro ao processar lead de membro:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Erro interno do servidor', detalhe: message },
      { status: 500 }
    )
  }
}
