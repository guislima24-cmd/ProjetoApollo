import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromRequest } from './lib/auth'

/**
 * Proxy de proteção da área autenticada (era middleware.ts no Next.js <16).
 *
 * - Rotas de página (`/prospectar/*`): redireciona para `/login` se não logado.
 * - Rotas API (`/api/member-leads/*`, `/api/auth/me`): retorna 401 JSON.
 * - Whitelist explícita: `/api/auth/login`, `/api/auth/logout`,
 *   `/api/member-leads/debug` (útil enquanto o setup do Sheets não estiver 100%).
 */

export const config = {
  matcher: [
    '/prospectar/:path*',
    '/api/member-leads/:path*',
    '/api/auth/me',
  ],
}

const API_WHITELIST = new Set<string>([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/member-leads/debug',
])

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (API_WHITELIST.has(pathname)) return NextResponse.next()

  const responsavel = await getMemberFromRequest(req)
  if (responsavel) return NextResponse.next()

  // Rotas de API → 401 JSON
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  // Rotas de página → redireciona pro /login preservando o destino
  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}
