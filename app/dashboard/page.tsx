import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getRecentProspections, getAllMembersProspections, getDynamicMemberTabs } from '@/lib/sheets'
import { isAdmin } from '@/lib/members.config'
import type { ProspectionStatus } from '@/types'
import DashboardClient from './DashboardClient'
import UsagePanel from './UsagePanel'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  Aguardando:  '#5a5550',
  Respondeu:   '#22c55e',
  'Reunião':   '#317039',
  'Follow-up': '#F1BE49',
  Descartado:  '#ef4444',
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.memberTab) redirect('/login')

  const { memberTab, role } = session.user
  const admin = isAdmin(role)

  const allTabs = admin ? await getDynamicMemberTabs().catch(() => [memberTab]) : [memberTab]

  const prospections = admin
    ? await getAllMembersProspections(50).catch(() => [])
    : (await getRecentProspections(memberTab, 100).catch(() => [])).map(p => ({ ...p, memberTab }))

  // ── Métricas ────────────────────────────────────────────────────────────────

  const mesAtual = new Date().toLocaleString('pt-BR', { month: 'long' })
  const now = new Date()

  const total = prospections.length
  const doMes = prospections.filter(p => {
    const parts = (p.dataEnvio ?? '').split('/')
    return parseInt(parts[1]) === now.getMonth() + 1 && parseInt(parts[2]) === now.getFullYear()
  }).length

  const porStatus = prospections.reduce<Record<string, number>>((acc, p) => {
    const s = p.status || 'Aguardando'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  const porCanal = prospections.reduce<Record<string, number>>((acc, p) => {
    const c = p.canal || 'LinkedIn'
    acc[c] = (acc[c] ?? 0) + 1
    return acc
  }, {})

  const taxaResposta = total > 0
    ? Math.round(((porStatus['Respondeu'] ?? 0) + (porStatus['Reunião'] ?? 0)) / total * 100)
    : 0

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 20px' }}>

      {/* ── Cabeçalho ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--cream)' }}>
            Dashboard CRM
          </h1>
          {admin && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 100,
              background: 'rgba(49,112,57,0.15)', border: '1px solid var(--green-primary)',
              color: 'var(--green-primary)', textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              {role === 'manager' ? 'Gerente' : 'Líder PV'}
            </span>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {admin ? `Visão consolidada — ${allTabs.length} membro(s)` : memberTab} · {mesAtual}
        </p>
      </div>

      {/* ── Cards de métricas ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 14,
        marginBottom: 28,
      }}>
        <MetricCard label="Total prospectado" value={total} />
        <MetricCard label={`Em ${mesAtual}`} value={doMes} highlight />
        <MetricCard label="Taxa de resposta" value={`${taxaResposta}%`} />
        <MetricCard label="LinkedIn" value={porCanal['LinkedIn'] ?? 0} />
        <MetricCard label="Email" value={porCanal['Email'] ?? 0} />
      </div>

      {/* ── Status breakdown ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>
          Por status
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {Object.entries(porStatus).map(([status, count]) => (
            <div key={status} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: '#0a0a0a', border: '1px solid var(--border)',
              borderRadius: 8, padding: '7px 12px',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[status] ?? '#5a5550', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--cream)' }}>{status}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLORS[status] ?? 'var(--text-secondary)' }}>{count}</span>
            </div>
          ))}
          {Object.keys(porStatus).length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma prospecção ainda</span>
          )}
        </div>
      </div>

      {/* ── Tabela interativa ── */}
      <DashboardClient
        initialProspections={prospections}
        memberTab={memberTab}
        isAdmin={admin}
        allTabs={allTabs}
      />

      {/* ── Monitoramento de uso (só admin) ── */}
      {admin && (
        <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
          <UsagePanel />
        </div>
      )}
    </main>
  )
}

function MetricCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${highlight ? 'var(--green-primary)' : 'var(--border)'}`,
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: highlight ? 'var(--green-primary)' : 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
        {value}
      </div>
    </div>
  )
}
