import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const MODEL_CANDIDATES = [
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash-8b',
]

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return Response.json({
      ok:  false,
      error: 'GEMINI_API_KEY ausente no .env.local',
      fix:  'Adicione GEMINI_API_KEY=AIza... no .env.local e reinicie o servidor',
    })
  }

  // Passo 1: listar modelos disponíveis
  let flashModels: string[] = []
  try {
    const listRes  = await fetch(`${BASE_URL}?key=${apiKey}`)
    const listData = await listRes.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    flashModels = (listData.models ?? [])
      .filter(m => m.name.includes('flash') && (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
    console.log('[GEMINI] Modelos flash disponíveis:', flashModels)
  } catch (err) {
    console.warn('[GEMINI] Falha ao listar modelos:', err)
  }

  // Passo 2: tentar candidatos — probe SEM responseMimeType (evita 400 em modelos que não suportam)
  const probeBody = JSON.stringify({
    contents: [{ parts: [{ text: 'ok' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 5 },
  })

  const tried: { model: string; status: number; snippet: string }[] = []

  const toTry = [
    ...MODEL_CANDIDATES.filter(c => flashModels.includes(c)),
    ...MODEL_CANDIDATES.filter(c => !flashModels.includes(c)),
  ]

  for (const model of toTry) {
    const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`
    try {
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: probeBody })
      const body = await res.text()
      tried.push({ model, status: res.status, snippet: body.substring(0, 80) })
      console.log(`[GEMINI] ${model} → ${res.status}: ${body.substring(0, 80)}`)
      if (res.ok) {
        return Response.json({ ok: true, model_tested: model, flash_models: flashModels, tried })
      }
    } catch (e) {
      tried.push({ model, status: 0, snippet: String(e) })
    }
  }

  return Response.json({
    ok:          false,
    flash_models: flashModels,
    tried,
    fix: flashModels.length
      ? `Modelos na sua chave: ${flashModels.slice(0, 5).join(', ')}. Nenhum aceitou a probe — veja campo "tried" para detalhes`
      : 'Chave sem acesso ao Gemini — ative a "Generative Language API" em console.cloud.google.com',
  })
}
