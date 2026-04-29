import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { isAllowedEmail, getMemberRole, getTabName } from './members.config'
import { ensureMemberTab } from './sheets'
import { authConfig } from './auth.config'
import type { JWT } from 'next-auth/jwt'

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type:    'refresh_token',
        refresh_token: token.refreshToken as string,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw data
    return {
      ...token,
      accessToken:  data.access_token,
      expiresAt:    Math.floor(Date.now() / 1000) + (data.expires_in as number),
      refreshToken: data.refresh_token ?? token.refreshToken,
      error:        undefined,
    }
  } catch (err) {
    console.error('[auth] refreshAccessToken failed:', err)
    return { ...token, error: 'RefreshTokenError' }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      const email = user.email ?? ''
      if (!isAllowedEmail(email)) {
        return `/login?error=EmailNaoAutorizado&email=${encodeURIComponent(email)}`
      }
      if (account) {
        const tabName = getTabName(email, user.name ?? email.split('@')[0])
        try { await ensureMemberTab(tabName) } catch (err) {
          console.error('[auth] ensureMemberTab failed:', err)
        }
      }
      return true
    },

    async jwt({ token, user, account }) {
      if (account && user) {
        const email = user.email ?? ''
        return {
          ...token,
          accessToken:  account.access_token,
          refreshToken: account.refresh_token,
          expiresAt:    account.expires_at,
          memberTab:    getTabName(email, user.name ?? email.split('@')[0]),
          role:         getMemberRole(email),
        }
      }

      // Sempre re-deriva memberTab e role a partir do email gravado no token,
      // para que mudanças em TAB_OVERRIDES / ROLE_OVERRIDES entrem em vigor
      // sem forçar re-login do usuário.
      const email = (token.email as string | undefined) ?? ''
      const name  = (token.name  as string | undefined) ?? email.split('@')[0]
      token.memberTab = getTabName(email, name)
      token.role      = getMemberRole(email)

      // Token ainda válido (com margem de 60s)
      if (token.expiresAt && Date.now() < token.expiresAt * 1000 - 60_000) {
        return token
      }

      // Expirado — tenta renovar
      if (!token.refreshToken) return { ...token, error: 'RefreshTokenError' }
      return refreshAccessToken(token)
    },

    async session({ session, token }) {
      session.user.memberTab = token.memberTab as string
      session.user.role      = (token.role as any) ?? 'member'
      session.accessToken    = token.accessToken as string
      session.error          = token.error as any
      return session
    },
  },

  pages: { signIn: '/login', error: '/login' },
})
