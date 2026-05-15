'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MemberDistribution } from '@/lib/members.config'

interface MembroStats extends MemberDistribution {
  total_ativos:    number
  enviados_semana: number
  responderam:     number
  pendentes_fila:  number
}

interface DashboardData {
  statusCounts:  Record<string, number>
  membros:       MembroStats[]
  taxaAceitacao: number
  taxaResposta:  number
  totalLeads:    number
}

const STATUS_LABELS: Record<string, string> = {
  nao_atribuido:       'Não atribuído',
  nao_contatado:       'Não contatado',
  enriquecido:         'Enriquecido',
  conexao_enviada:     'Conexão enviada',
  conexao_aceita:      'Conexão aceita',
  mensagem_enviada:    'Mensagem enviada',
  followup_1_enviado:  'Follow-up 1',
  followup_2_enviado:  'Follow-up 2',
  respondeu:           'Respondeu',
  descartado:          'Descartado',
  erro_enriquecimento: 'Erro enriquecimento',
}

export default function DashboardClient() {
  const [data, setData]           = useState<DashboardData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [pausando, setPausando]   = useState<string | null>(null)
  const [enriquecendo, setEnriq]  = useState(false)
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/dashboard')
      if (!res.ok) throw new Error('Erro ao carregar')
      setData(await res.json())
    } catch {
      setError('Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function pausarMembro(email: string, nome: string) {
    if (!confirm(`Redistribuir leads pendentes de ${nome} para os outros membros?`)) return
    setPausando(email)
    try {
      const res = await fetch('/api/admin/pausar-membro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await res.json()
      if (d.ok) { alert(`${d.redistribuidos} leads redistribuídos.`); await carregar() }
      else alert(d.error ?? 'Erro ao pausar membro.')
    } catch {
      alert('Erro de rede.')
    } finally {
      setPausando(null)
    }
  }

  async function rodarEnriquecimento() {
    setEnriq(true)
    setEnrichMsg(null)
    try {
      const res  = await fetch('/api/admin/enrich-leads', { method: 'POST' })
      const d    = await res.json()
      setEnrichMsg(d.ok ? `Enriquecidos: ${d.processados} · Erros: ${d.erros}` : (d.error ?? 'Erro'))
      if (d.ok) await carregar()
    } catch {
      setEnrichMsg('Erro de rede.')
    } finally {
      setEnriq(false)
    }
  }

  if (loading) return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px', textAlign: 'center' }}>
      <div className="spinner" style={{ width: 20, height: 20 }} />
    </main>
  )

  if (error || !data) return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px' }}>
      <p style={{ color: 'var(--red)', fontSize: 13 }}>{error ?? 'Sem dados'}</p>
    </main>
  )

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
            Painel Admin
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {data.totalLeads} leads no sistema
          </p>
        </div>
        <button className="btn-primary" onClick={rodarEnriquecimento} disabled={enriquecendo}>
          {enriquecendo ? 'Enriquecendo...' : 'Rodar enriquecimento'}
        </button>
      </div>

      {enrichMsg && (
        <div className="card" style={{ marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
          {enrichMsg}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard label="Total de leads"    valor={data.totalLeads} />
        <KpiCard label="Taxa de aceitação" valor={`${data.taxaAceitacao}%`} highlight />
        <KpiCard label="Taxa de resposta"  valor={`${data.taxaResposta}%`} highlight />
        <KpiCard label="Responderam"       valor={data.statusCounts['respondeu'] ?? 0} />
      </div>

      {/* Status */}
      <div className="card" style={{ marginBottom: 24 }}>
        <p className="section-label" style={{ marginBottom: 14 }}>Leads por status</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {Object.entries(STATUS_LABELS).map(([k, label]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{data.statusCounts[k] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Membros */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <p className="section-label">Membros</p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nome', 'Ativos', 'Enviados (semana)', 'Na fila', 'Responderam', ''].map(col => (
                  <th key={col} style={{
                    textAlign: col === 'Nome' ? 'left' : 'right',
                    padding: '10px 16px',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.07em', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.membros.map((m, i) => (
                <tr
                  key={m.email}
                  style={{ borderBottom: i < data.membros.length - 1 ? '1px solid var(--border)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--cream)' }}>{m.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email}</div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{m.total_ativos}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{m.enviados_semana}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{m.pendentes_fila}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{m.responderam}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => pausarMembro(m.email, m.nome)}
                      disabled={pausando === m.email}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: 12, color: 'var(--yellow)', opacity: pausando === m.email ? 0.4 : 1,
                      }}
                    >
                      {pausando === m.email ? 'Redistribuindo...' : 'Pausar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </main>
  )
}

function KpiCard({ label, valor, highlight }: { label: string; valor: number | string; highlight?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${highlight ? 'var(--green-primary)' : 'var(--border)'}`,
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: highlight ? 'var(--green-primary)' : 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
        {valor}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  )
}
