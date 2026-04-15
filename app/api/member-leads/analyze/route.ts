import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromRequest } from '@/lib/auth'
import {
  EXTRACTION_TOOL,
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt,
} from '@/lib/extractionPrompt'
import { ExtractionResult } from '@/types'

/**
 * POST /api/member-leads/analyze
 * Body: { email?: string, linkedin_url?: string, contexto?: string }
 * Retorna: ExtractionResult (campos + níveis de confiança).
 *
 * Usa Claude com `tool_use` forçado — único jeito determinístico de obter
 * JSON estruturado da API Anthropic.
 */

interface AnalyzeBody {
  email?: string
  linkedin_url?: string
  contexto?: string
}

interface AnthropicToolUseBlock {
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
  [key: string]: unknown
}

interface AnthropicContentBlock {
  type: string
  [key: string]: unknown
}

export async function POST(req: NextRequest) {
  try {
    const responsavel = await getMemberFromRequest(req)
    if (!responsavel) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = (await req.json().catch(() => null)) as AnalyzeBody | null
    if (!body) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
    }

    const email = body.email?.trim() || undefined
    const linkedin_url = body.linkedin_url?.trim() || undefined
    const contexto = body.contexto?.trim() || undefined

    if (!email && !linkedin_url && !contexto) {
      return NextResponse.json(
        { error: 'Informe pelo menos email, linkedin_url ou contexto' },
        { status: 400 }
      )
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
    }

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
        system: buildExtractionSystemPrompt(),
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: EXTRACTION_TOOL.name },
        messages: [
          {
            role: 'user',
            content: buildExtractionUserPrompt({ email, linkedin_url, contexto }),
          },
        ],
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
    const blocks = (claudeData.content ?? []) as AnthropicContentBlock[]
    const toolUse = blocks.find(
      (b): b is AnthropicToolUseBlock =>
        b.type === 'tool_use' && (b as AnthropicToolUseBlock).name === EXTRACTION_TOOL.name
    )

    if (!toolUse) {
      return NextResponse.json(
        { error: 'Claude não retornou dados estruturados' },
        { status: 502 }
      )
    }

    const input = toolUse.input as Partial<ExtractionResult>
    const result: ExtractionResult = {
      nome: input.nome ?? null,
      cargo: input.cargo ?? null,
      empresa: input.empresa ?? null,
      setor: input.setor ?? null,
      alvo: input.alvo === 'RD' ? 'RD' : 'Conéctar',
      confianca: {
        nome: input.confianca?.nome ?? 'baixa',
        empresa: input.confianca?.empresa ?? 'baixa',
        setor: input.confianca?.setor ?? 'baixa',
      },
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Erro em /api/member-leads/analyze:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Erro interno', detalhe: message },
      { status: 500 }
    )
  }
}
