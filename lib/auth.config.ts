import type { NextAuthConfig } from 'next-auth'

const PUBLIC_PATHS = ['/login', '/instalar', '/api/']

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
      return !!auth?.user
    },
  },
}
