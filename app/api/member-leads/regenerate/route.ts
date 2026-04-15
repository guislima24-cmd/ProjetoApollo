import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromRequest } from '@/lib/auth'
import { updateMensagemIA } from '@/lib/sheets'
import { buildPipelineSystemPrompt } from '@/lib/promptBuilder'

/**
 * POST /api/member-leads/regenerate
 * Body: { rowIndex: number, nome: string, empresa: string, setor?: string,
 *         canal?: 'E-mail' | 'LinkedIn', email?: string, linkedin_url?: string,
 *         mensagemAnterior?: string }
 *
 * Gera uma nova mensagem com ângulo diferente da anterior e reescreve a
 * coluna V da linha indicada na aba do membro logado.
 */

interface RegenerateBody {
  rowIndex?: number
  nome?: string
  empresa?: string
  setor?: string
  canal?: 'E-mail' | 'LinkedIn'
  email?: string
  linkedin_url?: string
  mensagemAnterior?: string
}

export async function POST(req: NextRequest) {
  try {
    const responsavel = await getMemberFromRequest(req)
    if (!responsavel) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as RegenerateBody | null
    if (!body) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const { rowIndex, nome, empresa, setor, canal, email, linkedin_url, mensagemAnterior } = body

    if (!rowIndex || !Number.isInteger(rowIndex) || rowIndex < 2) {
      return NextResponse.json({ error: 'rowIndex inválido' }, { status: 400 })
    }
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

    const canalStr = canal ?? (linkedin_url ? 'LinkedIn' : 'E-mail')
    const userPrompt = `Escreva uma mensagem de prospecção ${canalStr === 'LinkedIn' ? 'para LinkedIn' : 'por e-mail'} para:

- Nome: ${nome}
- Empresa: ${empresa}
- Setor: ${setor ?? 'Não informado'}
${linkedin_url ? `- LinkedIn: ${linkedin_url}` : ''}
${email ? `- E-mail: ${email}` : ''}
${mensagemAnterior ? `\nVersão anterior (NÃO repita esta abordagem, use um ângulo completamente diferente):\n${mensagemAnterior}` : ''}

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

    await updateMensagemIA(responsavel, rowIndex, mensagem)
    return NextResponse.json({ mensagem, rowIndex })
  } catch (error) {
    console.error('Erro em /api/member-leads/regenerate:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Erro interno', detalhe: message },
      { status: 500 }
    )
  }
}
