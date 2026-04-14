import { NextRequest, NextResponse } from 'next/server'
import { appendLeadToMemberTab, updateMensagemIA, MEMBER_TABS } from '@/lib/sheets'
import { buildPipelineSystemPrompt } from '@/lib/promptBuilder'
import { MemberLead } from '@/types'

interface MemberLeadBody extends MemberLead {
  responsavel: string
}

export async function POST(req: NextRequest) {
  try {
    const body: MemberLeadBody = await req.json()
    const { responsavel, nome, empresa, setor, canal, email, linkedin_url, alvo } = body

    if (!responsavel || !nome || !empresa) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: responsavel, nome, empresa' },
        { status: 400 }
      )
    }

    if (!MEMBER_TABS.includes(responsavel)) {
      return NextResponse.json(
        { error: `Membro inválido. Válidos: ${MEMBER_TABS.join(', ')}` },
        { status: 400 }
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
    }

    const missingSheetsEnv: string[] = []
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) missingSheetsEnv.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    if (!process.env.GOOGLE_PRIVATE_KEY) missingSheetsEnv.push('GOOGLE_PRIVATE_KEY')
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
    const rowIndex = await appendLeadToMemberTab(responsavel, lead)

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
      const err = await response.json()
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
    // Erros comuns da API Google Sheets trazem um código + texto útil em `message`
    return NextResponse.json(
      { error: 'Erro interno do servidor', detalhe: message },
      { status: 500 }
    )
  }
}
