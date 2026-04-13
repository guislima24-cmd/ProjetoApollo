import { NextRequest, NextResponse } from 'next/server'
import { getLeadById, updateLeadField } from '@/lib/sheets'
import { buildPipelineSystemPrompt, buildPipelineLeadPrompt } from '@/lib/promptBuilder'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })
    }

    const result = await getLeadById(id)
    if (!result) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }

    const { lead, rowIndex } = result

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
        messages: [{ role: 'user', content: buildPipelineLeadPrompt(lead) }],
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      return NextResponse.json(
        { error: err.error?.message ?? 'Erro na API do Claude' },
        { status: response.status }
      )
    }

    const data = await response.json()
    const mensagem: string = data.content[0]?.text ?? ''

    await updateLeadField(rowIndex, 'mensagem_gerada', mensagem)
    await updateLeadField(rowIndex, 'status', 'pronto_envio')

    return NextResponse.json({ mensagem, status: 'pronto_envio' })
  } catch (error) {
    console.error('Erro ao gerar mensagem:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
