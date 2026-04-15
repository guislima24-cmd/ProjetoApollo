/**
 * Autenticação simples por JWT em cookie httpOnly.
 *
 * - 11 membros com credenciais pré-provisionadas em `MEMBER_CREDENTIALS`
 *   (formato: "username:sha256hex|username:sha256hex|...").
 * - O hash é `SHA-256(senha + JWT_SECRET)`, calculado com Web Crypto
 *   (disponível tanto em Node quanto em Edge runtime — middleware precisa).
 * - O JWT carrega `{ responsavel }` com o nome EXATO da aba na planilha.
 */

import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'
import { isValidMemberTab, MemberTab, usernameToTab } from './members'

export const AUTH_COOKIE = 'apollo_session'
export const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 dias
const ALG = 'HS256'

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET ausente ou com menos de 32 caracteres')
  }
  return new TextEncoder().encode(s)
}

/** SHA-256(senha + JWT_SECRET) em hex lowercase. */
export async function hashPassword(senha: string): Promise<string> {
  const secret = process.env.JWT_SECRET ?? ''
  const data = new TextEncoder().encode(senha + secret)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Comparação em tempo constante — evita timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Valida `username` + `senha` contra `MEMBER_CREDENTIALS`.
 * Retorna o nome da aba se for válido, `null` caso contrário.
 */
export async function validateCredentials(
  username: string,
  senha: string
): Promise<MemberTab | null> {
  const raw = process.env.MEMBER_CREDENTIALS
  if (!raw) return null

  const expectedHash = raw
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [u, h] = entry.split(':')
      return { user: u?.trim().toLowerCase() ?? '', hash: h?.trim() ?? '' }
    })
    .find((x) => x.user === username.trim().toLowerCase())?.hash

  if (!expectedHash) return null

  const actualHash = await hashPassword(senha)
  if (!timingSafeEqual(actualHash, expectedHash)) return null

  return usernameToTab(username)
}

export async function signToken(responsavel: MemberTab): Promise<string> {
  return new SignJWT({ responsavel })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

/** Retorna o nome da aba se o token for válido e o responsavel for reconhecido. */
export async function verifyToken(token: string): Promise<MemberTab | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const resp = payload.responsavel
    if (typeof resp !== 'string') return null
    return isValidMemberTab(resp) ? resp : null
  } catch {
    return null
  }
}

/** Extrai o membro do cookie de sessão em uma request. */
export async function getMemberFromRequest(
  req: NextRequest
): Promise<MemberTab | null> {
  const token = req.cookies.get(AUTH_COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}
