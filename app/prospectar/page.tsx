import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AUTH_COOKIE, verifyToken } from '@/lib/auth'
import ProspectarForm from '@/components/prospectar/ProspectarForm'
import RecentLeads from '@/components/prospectar/RecentLeads'

/**
 * Página protegida — server component. Lê cookie e bloqueia acesso se ausente.
 * (O middleware também cobre esse caminho, mas uma checagem dupla no servidor
 * deixa a renderização determinística e evita flash pra quem já tem SSR cache.)
 */

export default async function ProspectarPage() {
  const store = await cookies()
  const token = store.get(AUTH_COOKIE)?.value
  const responsavel = token ? await verifyToken(token) : null

  if (!responsavel) {
    redirect('/login?next=/prospectar')
  }

  return (
    <main
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 32 }}>Prospectar</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
          Cole um email, URL do LinkedIn ou contexto. A IA extrai os dados,
          você revisa e um clique grava na sua aba da planilha comercial com
          o pitch personalizado.
        </p>
      </header>

      <ProspectarForm responsavel={responsavel} />
      <RecentLeads />
    </main>
  )
}
