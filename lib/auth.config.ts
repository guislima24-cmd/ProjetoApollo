import type { NextAuthConfig } from 'next-auth'

const PUBLIC_PATHS = ['/login', '/instalar', '/api/']

// Emails admin — mantido em sync manual com ADMIN_EMAILS em members.config.ts.
// Duplicado aqui porque auth.config.ts roda no Edge Runtime (não suporta todo Node.js).
const ADMIN_EMAIL_SET = new Set([
  'guilherme.lima@ufabcjr.com.br',
  'guislima24@gmail.com',
  'tiago.santos@ufabcjr.com.br',
  'felipe.ikeda@ufabcjr.com.br',
  'anna.ferreira@ufabcjr.com.br',
])

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p)) ||
    pathname.endsWith('.zip')
  )
}

export const authConfig: NextAuthConfig = {
  providers: [],
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl
      if (isPublic(pathname)) return true
      if (!auth?.user) return false

      // Rotas /admin/* exigem email admin
      if (pathname.startsWith('/admin')) {
        const email = (auth.user.email ?? '').toLowerCase().trim()
        return ADMIN_EMAIL_SET.has(email)
      }

      return true
    },
  },
}
