import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/auth'

/**
 * POST /api/auth/hash-password
 * Body: { username: string, senha: string }
 * Retorna: { linha: "username:hash" }
 *
 * Utilitário de setup — calcula o hash do mesmo jeito que `validateCredentials`
 * espera. Só habilita se `ENABLE_HASH_SETUP=true` na env. Deixe essa env
 * habilitada só durante a configuração inicial e remova depois.
 *
 * Nota de segurança: mesmo se alguém descobrir essa rota ativa, não consegue
 * autenticar — só gerar hashes. Pra fazer login, o hash tem que estar em
 * `MEMBER_CREDENTIALS`, que é controlada por quem tem acesso ao Vercel.
 */

export async function POST(req: NextRequest) {
  if (process.env.ENABLE_HASH_SETUP !== 'true') {
    return NextResponse.json(
      { error: 'Setup desabilitado. Defina ENABLE_HASH_SETUP=true temporariamente.' },
      { status: 403 }
    )
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return NextResponse.json(
      { error: 'JWT_SECRET ausente ou com menos de 32 caracteres.' },
      { status: 500 }
    )
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | { username?: string; senha?: string }
      | null

    const username = body?.username?.trim().toLowerCase() ?? ''
    const senha = body?.senha ?? ''

    if (!username || !senha) {
      return NextResponse.json(
        { error: 'username e senha são obrigatórios' },
        { status: 400 }
      )
    }

    const hash = await hashPassword(senha)
    return NextResponse.json({ linha: `${username}:${hash}`, hash, username })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Erro interno', detalhe: message }, { status: 500 })
  }
}
