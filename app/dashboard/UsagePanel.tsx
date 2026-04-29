'use client'
import { useEffect, useState } from 'react'

type Period = { geracoes: number; tokens: number; custo: number; registros: number; emails: number }
type UsageData = {
  totais: { mes: Period; semana: Period; hoje: Period }
  porMembro: Record<string, { geracoes: number; tokens: number; custo: number }>
  totalLogs: number
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontFamily: 'Syne, sans-serif', fontWeight: 800, color: 'var(--cream)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null)
  const [period, setPeriod] = useState<'hoje' | 'semana' | 'mes'>('mes')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/usage')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('Erro ao carregar dados'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '24px 0' }}>Carregando dados de uso...</div>
  if (error)   return <div style={{ color: '#f87171', fontSize: 14, padding: '24px 0' }}>{error}</div>
  if (!data)   return null

  const t = data.totais[period]
  const periodLabel = { hoje: 'Hoje', semana: 'Esta semana', mes: 'Este mês' }[period]
  const custoFormatado = `$${t.custo.toFixed(4)}`
  const tokensFormatado = t.tokens >= 1000 ? `${(t.tokens / 1000).toFixed(1)}k` : String(t.tokens)

  const membros = Object.entries(data.porMembro).sort((a, b) => b[1].custo - a[1].custo)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header + seletor de período */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>
          Uso & Custos
        </h2>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          {(['hoje', 'semana', 'mes'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              background: period === p ? 'var(--green-primary)' : 'transparent',
              color: period === p ? 'var(--cream)' : 'var(--text-muted)',
              border: 'none', borderRadius: 6, padding: '6px 14px',
              fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: 'pointer',
            }}>
              {{ hoje: 'Hoje', semana: 'Semana', mes: 'Mês' }[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <Card label="Gerações IA" value={String(t.geracoes)} sub={periodLabel} />
        <Card label="Tokens Claude" value={tokensFormatado} sub={periodLabel} />
        <Card label="Custo Estimado" value={custoFormatado} sub="Claude API (USD)" />
        <Card label="Registros" value={String(t.registros)} sub="Planilha" />
        <Card label="Emails enviados" value={String(t.emails)} sub={periodLabel} />
      </div>

      {/* Custo projetado */}
      {period !== 'mes' && data.totais.mes.custo > 0 && (
        <div style={{ background: 'rgba(241,190,73,0.06)', border: '1px solid rgba(241,190,73,0.2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#c9a84c' }}>
          Projeção mensal (baseado no mês atual): <strong>${data.totais.mes.custo.toFixed(4)}</strong>
        </div>
      )}

      {/* Tabela por membro (mês) */}
      {membros.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Uso por membro — este mês
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                {['Membro', 'Gerações', 'Tokens', 'Custo (USD)'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {membros.map(([membro, stats], i) => (
                <tr key={membro} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--cream)', fontFamily: 'DM Sans, sans-serif' }}>{membro}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{stats.geracoes}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {stats.tokens >= 1000 ? `${(stats.tokens / 1000).toFixed(1)}k` : stats.tokens}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: stats.custo > 0.5 ? '#f87171' : 'var(--green)', fontFamily: 'monospace', fontWeight: 700 }}>
                    ${stats.custo.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {membros.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          Nenhum dado de uso registrado ainda. Os dados aparecem após a primeira geração de mensagem.
        </div>
      )}
    </div>
  )
}
