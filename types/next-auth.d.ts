import 'next-auth'
import 'next-auth/jwt'
import type { MemberRole } from '@/lib/members.config'

declare module 'next-auth' {
  interface Session {
    accessToken: string
    error?: 'RefreshTokenError'
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      memberTab: string
      role: MemberRole
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    memberTab?: string
    role?: MemberRole
    error?: 'RefreshTokenError'
  }
}
