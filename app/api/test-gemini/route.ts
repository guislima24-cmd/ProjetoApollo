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

  const model = 'gemini-2.0-flash'
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  try {
    const res = await fetch(url, {
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
        ok:     false,
        status: res.status,
        model,
        error:  body.substring(0, 600),
        fix:    res.status === 404
          ? 'Modelo não encontrado — verifique se gemini-2.0-flash está disponível na sua região/chave'
          : res.status === 400
          ? 'Chave API inválida ou projeto sem permissão para Gemini'
          : res.status === 429
          ? 'Rate limit atingido — aguarde 1 minuto e tente novamente'
          : 'Erro inesperado — veja campo error acima',
      })
    }

    return Response.json({ ok: true, model, response_preview: body.substring(0, 200) })
  } catch (err) {
    return Response.json({ ok: false, error: String(err) })
  }
}
