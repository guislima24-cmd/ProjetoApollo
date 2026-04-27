import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildSystemPrompt, buildLeadPrompt, buildManualLeadPrompt, buildRegeneratePrompt } from '@/lib/promptBuilder'
import { logUsage } from '@/lib/sheets'
import { Lead, CampaignConfig, ManualLead } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, config } = body
    const ia: 'gemini' | 'claude' = config?.ia ?? 'gemini'

    let userPrompt = ''
    if (type === 'bulk') {
      userPrompt = buildLeadPrompt(body.lead as Lead)
    } else if (type === 'manual') {
      userPrompt = buildManualLeadPrompt(body.lead as ManualLead, config as CampaignConfig)
    } else if (type === 'regenerate') {
      userPrompt = buildRegeneratePrompt(body.lead as Lead, body.mensagemAnterior as string)
    } else {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }

    const systemPrompt = buildSystemPrompt(config as CampaignConfig)

    const session = await auth()
    const memberTab = session?.user?.memberTab ?? 'desconhecido'

    // ── Gemini ──────────────────────────────────────────────────────────────
    if (ia === 'gemini') {
      const geminiKey = process.env.GEMINI_API_KEY
      if (!geminiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY não configurada no servidor' }, { status: 500 })
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          }),
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        let msg = 'Erro na API do Gemini'
        try { msg = JSON.parse(errText).error?.message ?? msg } catch {}
        if (res.status === 429) msg = 'Cota gratuita do Gemini esgotada. Tente novamente amanhã ou selecione Claude.'
        return NextResponse.json({ error: msg }, { status: res.status })
      }
      const data = await res.json()
      const mensagem: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      if (!mensagem) {
        const reason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? 'resposta vazia'
        return NextResponse.json({ error: `Gemini bloqueou a geração: ${reason}. Tente Claude.` }, { status: 500 })
      }
      logUsage({ memberTab, acao: `geração_${type}_gemini`, tokensInput: 0, tokensOutput: 0 })
      return NextResponse.json({ mensagem })
    }

    // ── Claude ───────────────────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' }, { status: 500 })
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!response.ok) {
      const err = await response.json()
      const isQuota = response.status === 429
      const msg = isQuota
        ? 'Limite de requisições do Claude atingido. Aguarde alguns instantes ou selecione Gemini.'
        : (err.error?.message ?? 'Erro na API do Claude')
      return NextResponse.json({ error: msg }, { status: response.status })
    }
    const data = await response.json()
    const mensagem: string = data.content[0]?.text || ''
    const tokensInput:  number = data.usage?.input_tokens  ?? 0
    const tokensOutput: number = data.usage?.output_tokens ?? 0
    logUsage({ memberTab, acao: `geração_${type}_claude`, tokensInput, tokensOutput })
    return NextResponse.json({ mensagem, tokensInput, tokensOutput })

  } catch (error) {
    console.error('Erro na geração:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
