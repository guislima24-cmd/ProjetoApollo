import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { logUsage, saveQualifiedLead } from '@/lib/sheets'

type BantKey = 'budget' | 'authority' | 'need' | 'timeline'
type IceKey  = 'impact' | 'confidence' | 'ease'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.memberTab) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }
    const memberTab = session.user.memberTab

    const body = await req.json()
    const { empresa, setor, contato, cargo, contexto, bant, ice } = body as {
      empresa: string
      setor: string
      contato: string
      cargo: string
      contexto: string
      bant: Record<BantKey, number>
      ice: Record<IceKey, number>
    }

    if (!empresa || !contato) {
      return NextResponse.json({ error: 'Empresa e contato são obrigatórios' }, { status: 400 })
    }

    const bantTotal  = bant.budget + bant.authority + bant.need + bant.timeline
    const iceAvg     = (ice.impact + ice.confidence + ice.ease) / 3
    const scoreFinal = Math.round((bantTotal / 8) * 50 + (iceAvg / 10) * 50)
    const classificacao = scoreFinal >= 65 ? 'Hot' : scoreFinal >= 35 ? 'Warm' : 'Cold'

    const bantLabel = (v: number) => v === 0 ? 'Não' : v === 1 ? 'Talvez' : 'Sim'

    const prompt = `Você é um consultor especialista em vendas B2B. Analise o lead abaixo e retorne APENAS um objeto JSON válido, sem markdown, sem texto fora do JSON.

DADOS DO LEAD:
- Empresa: ${empresa}
- Setor: ${setor || 'Não informado'}
- Contato: ${contato}${cargo ? ` (${cargo})` : ''}
- Contexto: ${contexto || 'Não informado'}

AVALIAÇÃO BANT:
- Budget (Orçamento): ${bantLabel(bant.budget)} (${bant.budget}/2)
- Authority (Autoridade de decisão): ${bantLabel(bant.authority)} (${bant.authority}/2)
- Need (Necessidade/Dor): ${bantLabel(bant.need)} (${bant.need}/2)
- Timeline (Urgência/Prazo): ${bantLabel(bant.timeline)} (${bant.timeline}/2)
- Total BANT: ${bantTotal}/8

AVALIAÇÃO ICE:
- Impact (Impacto potencial): ${ice.impact}/10
- Confidence (Confiança de conversão): ${ice.confidence}/10
- Ease (Facilidade de abordagem): ${ice.ease}/10
- Média ICE: ${iceAvg.toFixed(1)}/10

SCORE CALCULADO: ${scoreFinal}/100 — Classificação: ${classificacao}

Retorne exatamente este JSON (todos os campos são obrigatórios):
{
  "summary": "análise geral em 2-3 frases objetivas sobre o potencial do lead",
  "bant_comments": {
    "budget": "comentário sobre orçamento disponível",
    "authority": "comentário sobre autoridade de decisão",
    "need": "comentário sobre necessidade ou dor",
    "timeline": "comentário sobre urgência ou prazo"
  },
  "strengths": ["ponto forte 1", "ponto forte 2"],
  "risks": ["risco 1", "risco 2"],
  "next_steps": ["próximo passo 1", "próximo passo 2", "próximo passo 3"],
  "verdict": "frase direta e objetiva de veredicto sobre investir neste lead"
}`

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const isQuota = response.status === 429
      const msg = isQuota
        ? 'Limite de requisições do Claude atingido. Aguarde alguns instantes.'
        : (err.error?.message ?? 'Erro na API do Claude')
      return NextResponse.json({ error: msg }, { status: response.status })
    }

    const data = await response.json()
    const text: string = data.content[0]?.text ?? ''
    const tokensInput:  number = data.usage?.input_tokens  ?? 0
    const tokensOutput: number = data.usage?.output_tokens ?? 0

    let analysis
    try {
      const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()
      analysis = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'Falha ao processar resposta da IA. Tente novamente.' }, { status: 500 })
    }

    // Salva no Sheets — erro não bloqueia a resposta
    saveQualifiedLead({
      empresa, setor, contato, cargo,
      bantScore: bantTotal,
      iceScore: iceAvg,
      scoreFinal,
      classificacao,
      veredictoIa: analysis.verdict ?? '',
      memberTab,
    }).catch(err => console.error('[qualify] Sheets save failed:', err))

    logUsage({ memberTab, acao: 'qualificacao_lead', tokensInput, tokensOutput })

    return NextResponse.json({
      ok: true,
      scores: { bantTotal, iceAvg: parseFloat(iceAvg.toFixed(1)), scoreFinal, classificacao },
      analysis,
    })
  } catch (error) {
    console.error('[qualify]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
