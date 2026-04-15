import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, COOKIE_MAX_AGE_SECONDS, signToken, validateCredentials } from '@/lib/auth'

/**
 * POST /api/auth/login
 * Body: { username: string, senha: string }
 * Resposta 200: { responsavel: string } + Set-Cookie httpOnly
 * Respostas de erro: 400 (campos) | 401 (credenciais) | 429 (rate limit)
 *
 * Rate limit simples em memória: 5 tentativas por 15 minutos, por IP.
 * Em serverless isso só persiste dentro de uma instância; para produção com
 * tráfego real, substituir por algo como Upstash. Pra 11 usuários, serve.
 */

interface Attempt {
  count: number
  resetAt: number // epoch ms
}

const ATTEMPTS = new Map<string, Attempt>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now()
  const entry = ATTEMPTS.get(ip)
  if (!entry || now > entry.resetAt) {
    ATTEMPTS.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true }
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  entry.count += 1
  return { ok: true }
}

function resetAttempts(ip: string) {
  ATTEMPTS.delete(ip)
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = checkRateLimit(ip)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Muitas tentativas. Tente de novo em ${rl.retryAfter}s.` },
        { status: 429 }
      )
    }

    const body = await req.json().catch(() => null) as
      | { username?: string; senha?: string }
      | null

    const username = body?.username?.trim() ?? ''
    const senha = body?.senha ?? ''

    if (!username || !senha) {
      return NextResponse.json(
        { error: 'username e senha são obrigatórios' },
        { status: 400 }
      )
    }

    const responsavel = await validateCredentials(username, senha)
    if (!responsavel) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    // Login OK — zera o contador de tentativas pra esse IP
    resetAttempts(ip)

    const token = await signToken(responsavel)
    const res = NextResponse.json({ responsavel })
    res.cookies.set({
      name: AUTH_COOKIE,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    })
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Erro interno no login', detalhe: message },
      { status: 500 }
    )
  }
}
