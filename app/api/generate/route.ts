import { NextRequest, NextResponse } from 'next/server'
import { buildSystemPrompt, buildLeadPrompt, buildManualLeadPrompt, buildRegeneratePrompt } from '@/lib/promptBuilder'
import { Lead, CampaignConfig, ManualLead } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, config } = body

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key não configurada' }, { status: 500 })
    }

    let systemPrompt = buildSystemPrompt(config as CampaignConfig)
    let userPrompt = ''

    if (type === 'bulk') {
      const lead: Lead = body.lead
      userPrompt = buildLeadPrompt(lead)
    } else if (type === 'manual') {
      const lead: ManualLead = body.lead
      userPrompt = buildManualLeadPrompt(lead, config as CampaignConfig)
    } else if (type === 'regenerate') {
      const lead: Lead = body.lead
      const mensagemAnterior: string = body.mensagemAnterior
      userPrompt = buildRegeneratePrompt(lead, mensagemAnterior)
    } else {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json({ error: error.error?.message || 'Erro na API' }, { status: response.status })
    }

    const data = await response.json()
    const mensagem = data.content[0]?.text || ''

    return NextResponse.json({ mensagem })
  } catch (error) {
    console.error('Erro na geração:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
