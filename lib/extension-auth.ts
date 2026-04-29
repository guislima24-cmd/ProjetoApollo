/**
 * Valida um next-auth session token enviado pelo header X-Session-Token
 * (usado pelo background service worker da extensão Chrome, que não tem
 * acesso ao cookie store do browser).
 *
 * NextAuth v5 usa JWE (encrypted), não JWS. Usamos `decode` do próprio
 * next-auth/jwt que lida com a derivação de chave HKDF corretamente.
 */

import { decode } from 'next-auth/jwt'
import { getTabName } from './members.config'

export async function verifyToken(token: string): Promise<string | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''
  if (!secret || !token) return null

  // NextAuth v5 deriva a chave JWE usando o nome do cookie como salt.
  // Em produção (HTTPS) o cookie é __Secure-next-auth.session-token.
  const salts = [
    '__Secure-next-auth.session-token',
    'next-auth.session-token',
  ]

  for (const salt of salts) {
    try {
      const payload = await decode({ token, secret, salt }) as Record<string, unknown> | null
      if (!payload) continue

      // memberTab é gravado diretamente no JWT pelo jwt callback
      if (typeof payload.memberTab === 'string' && payload.memberTab) {
        return payload.memberTab
      }

      // Fallback: deriva a partir do email
      const email = typeof payload.email === 'string' ? payload.email : null
      if (!email) continue
      const name  = typeof payload.name === 'string' ? payload.name : email.split('@')[0]
      return getTabName(email, name)
    } catch {
      continue
    }
  }

  return null
}
