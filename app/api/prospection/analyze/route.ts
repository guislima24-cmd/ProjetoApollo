/**
 * POST /api/prospection/analyze
 *
 * Recebe email, URL do LinkedIn e/ou contexto, usa Claude para extrair
 * dados estruturados do lead (nome, cargo, empresa, setor).
 *
 * Substitui /api/member-leads/analyze.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildExtractionSystemPrompt, buildExtractionUserPrompt, EXTRACTION_TOOL } from '@/lib/extractionPrompt'
import type { ExtractionResult } from '@/types'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { email, linkedin_url, contexto } = body as {
    email?: string
    linkedin_url?: string
    contexto?: string
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
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

    const data = await response.json()
    const toolUse = data.content?.find((c: { type: string }) => c.type === 'tool_use')

    if (!toolUse?.input) {
      return NextResponse.json({ error: 'Claude não retornou dados estruturados' }, { status: 500 })
    }

    return NextResponse.json(toolUse.input as ExtractionResult)
  } catch (err) {
    console.error('[prospection/analyze]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro inesperado' },
      { status: 500 }
    )
  }
}
