import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import ProspectarForm from '@/components/prospectar/ProspectarForm'
import RecentLeads from '@/components/prospectar/RecentLeads'

export default async function ProspectarPage() {
  const session = await auth()

  if (!session?.user?.memberTab) {
    redirect('/login')
  }

  return (
    <main style={{
      maxWidth: 960,
      margin: '0 auto',
      padding: '32px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 32,
    }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 28 }}>Prospectar</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
          Cole um email, URL do LinkedIn ou contexto. A IA extrai os dados,
          você revisa e um clique grava na sua aba da planilha.
        </p>
      </header>

      <ProspectarForm responsavel={session.user.memberTab} />
      <RecentLeads />
    </main>
  )
}
