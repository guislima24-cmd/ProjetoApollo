import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

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
  let availableFlashModels: string[] = []
  try {
    const listRes  = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    const listData = await listRes.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
    availableFlashModels = (listData.models ?? [])
      .filter(m => m.name.includes('flash') && (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
    console.log('[GEMINI] Modelos flash disponíveis:', availableFlashModels)
  } catch (err) {
    console.warn('[GEMINI] Falha ao listar modelos:', err)
  }

  // Passo 2: testar com gemini-flash-latest (alias estável gratuito)
  const model = 'gemini-flash-latest'
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Responda somente: {"ok":true}' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 20, responseMimeType: 'application/json' },
      }),
    })

    const body = await res.text()

    if (!res.ok) {
      return Response.json({
        ok:                   false,
        status:               res.status,
        model_tested:         model,
        available_flash_models: availableFlashModels,
        error:                body.substring(0, 600),
        fix:    res.status === 404
          ? `Modelo "${model}" não encontrado. Modelos disponíveis: ${availableFlashModels.join(', ') || 'nenhum flash encontrado'}`
          : res.status === 400
          ? 'Chave API inválida ou projeto sem permissão para Gemini'
          : res.status === 429
          ? 'Rate limit atingido (quota:0 = modelo não disponível no free tier) — tente gemini-1.5-flash-8b'
          : 'Erro inesperado — veja campo error acima',
      })
    }

    return Response.json({
      ok:                   true,
      model_tested:         model,
      available_flash_models: availableFlashModels,
      response_preview:     body.substring(0, 200),
    })
  } catch (err) {
    return Response.json({ ok: false, error: String(err), available_flash_models: availableFlashModels })
  }
}
