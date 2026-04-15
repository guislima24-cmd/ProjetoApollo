import { cookies } from 'next/headers'
import { AUTH_COOKIE, verifyToken } from '@/lib/auth'
import LogoutButton from './LogoutButton'

/**
 * Header fino mostrado no topo de todas as páginas quando há sessão.
 * Server component: lê o cookie direto, sem round-trip pro /api/auth/me.
 */
export default async function SessionHeader() {
  const store = await cookies()
  const token = store.get(AUTH_COOKIE)?.value
  const responsavel = token ? await verifyToken(token) : null

  if (!responsavel) return null

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border)',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13,
        background: 'var(--bg-card)',
      }}
    >
      <span style={{ color: 'var(--text-secondary)' }}>
        Logado como <strong style={{ color: 'var(--text-primary)' }}>{responsavel}</strong>
      </span>
      <LogoutButton />
    </header>
  )
}
