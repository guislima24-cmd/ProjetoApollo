import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Candidatos gratuitos em ordem de preferência
const FREE_FLASH_CANDIDATES = [
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'Não autenticado' }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return Response.json({
      ok:    false,
      error: 'GEMINI_API_KEY ausente no .env.local',
      fix:   'Adicione GEMINI_API_KEY=AIza... no arquivo .env.local e reinicie o servidor',
    })
  }

  // Passo 1: listar modelos disponíveis para esta chave
  let listedModels: string[] = []
  try {
    const listRes  = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    const listData = await listRes.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    listedModels = (listData.models ?? [])
      .filter(m => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
    console.log('[GEMINI] Todos os modelos disponíveis com generateContent:', listedModels)
  } catch (err) {
    console.warn('[GEMINI] Falha ao listar modelos:', err)
  }

  const flashModels = listedModels.filter(m => m.includes('flash'))
  console.log('[GEMINI] Modelos flash disponíveis:', flashModels)

  // Passo 2: tentar cada candidato até achar um que funcione
  const testBody = JSON.stringify({
    contents: [{ parts: [{ text: 'Responda somente: {"ok":true}' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 20, responseMimeType: 'application/json' },
  })

  // Prioriza modelos listados pela API; fallback para candidatos conhecidos
  const toTry = [
    ...FREE_FLASH_CANDIDATES.filter(c => listedModels.includes(c)),
    ...FREE_FLASH_CANDIDATES.filter(c => !listedModels.includes(c)),
  ]

  for (const model of toTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    try {
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: testBody })
      const body = await res.text()
      if (res.ok) {
        console.log('[GEMINI] Modelo funcionando:', model)
        return Response.json({
          ok:           true,
          model_tested: model,
          flash_models: flashModels,
          message:      `Use este modelo: ${model}`,
        })
      }
      console.log(`[GEMINI] Modelo ${model} → ${res.status}: ${body.substring(0, 100)}`)
    } catch {}
  }

  return Response.json({
    ok:          false,
    flash_models: flashModels,
    tried:       toTry,
    error:       'Nenhum modelo gratuito funcionou',
    fix:         flashModels.length
      ? `Modelos listados pela API: ${flashModels.join(', ')} — informe ao desenvolvedor qual usar`
      : 'Chave sem acesso ao Gemini — verifique se o projeto tem a API "Generative Language" ativada em console.cloud.google.com',
  })
}
