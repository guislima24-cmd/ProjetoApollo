'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend,
} from 'recharts'

const C = {
  green:  '#4ade80',
  teal:   '#2dd4bf',
  yellow: '#fbbf24',
  purple: '#a78bfa',
  muted:  '#475569',
  red:    '#f87171',
}

interface Membro { email: string; nome: string; conexoes: number; aceitas: number; responderam: number; rds: number }

interface DashboardData {
  mesSelecionado:          string
  mesesDisponiveis:        string[]
  conexoes:                number
  aceitas:                 number
  responderam:             number
  rds:                     number
  contratos:               number
  taxaAceitacao:           number
  taxaResposta:            number
  funil:                   Array<{ name: string; valor: number }>
  porMembro:               Array<{ nome: string; conexoes: number; aceitas: number; responderam: number }>
  historico:               Array<{ mes: string; conexoes: number; responderam: number }>
  membros:                 Membro[]
  pendentesEnriquecimento: number
}

function labelMes(yyyyMM: string): string {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const [y, m] = yyyyMM.split('-')
  return `${meses[parseInt(m, 10) - 1]} ${y}`
}

export default function DashboardClient() {
  const [data, setData]           = useState<DashboardData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [mes, setMes]             = useState<string>('')
  const [pausando, setPausando]   = useState<string | null>(null)
  const [enriquecendo, setEnriq]  = useState(false)
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null)

  const carregar = useCallback(async (mesFiltro?: string) => {
    setLoading(true)
    setError(null)
    try {
      const qs  = mesFiltro ? `?mes=${mesFiltro}` : ''
      const res = await fetch(`/api/admin/dashboard${qs}`)
      if (!res.ok) throw new Error('Erro ao carregar')
      const d = await res.json() as DashboardData
      setData(d)
      setMes(d.mesSelecionado)
    } catch {
      setError('Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function handleMes(novoMes: string) {
    setMes(novoMes)
    carregar(novoMes)
  }

  async function pausarMembro(email: string, nome: string) {
    if (!confirm(`Redistribuir leads pendentes de ${nome} para os outros membros?`)) return
    setPausando(email)
    try {
      const res = await fetch('/api/admin/pausar-membro', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await res.json()
      if (d.ok) { alert(`${d.redistribuidos} leads redistribuídos.`); carregar(mes) }
      else alert(d.error ?? 'Erro ao pausar membro.')
    } catch { alert('Erro de rede.') }
    finally { setPausando(null) }
  }

  async function rodarEnriquecimento() {
    setEnriq(true)
    setEnrichMsg(null)
    try {
      const res = await fetch('/api/admin/enrich-leads', { method: 'POST' })
      const d   = await res.json()
      setEnrichMsg(d.ok ? `Enriquecidos: ${d.processados} · Erros: ${d.erros}` : (d.error ?? 'Erro'))
      if (d.ok) carregar(mes)
    } catch { setEnrichMsg('Erro de rede.') }
    finally { setEnriq(false) }
  }

  if (loading && !data) return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 20px', textAlign: 'center' }}>
      <div className="spinner" style={{ width: 20, height: 20, margin: '60px auto' }} />
    </main>
  )

  if (error || !data) return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 20px' }}>
      <p style={{ color: 'var(--red)', fontSize: 13 }}>{error ?? 'Sem dados'}</p>
    </main>
  )

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 20px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
            Dashboard Comercial
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            Desempenho da equipe de prospecção
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Seletor de mês */}
          <select
            value={mes}
            onChange={e => handleMes(e.target.value)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--cream)', borderRadius: 8, padding: '7px 12px',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            {data.mesesDisponiveis.length === 0 && (
              <option value={mes}>{labelMes(mes)}</option>
            )}
            {data.mesesDisponiveis.map(m => (
              <option key={m} value={m}>{labelMes(m)}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={rodarEnriquecimento} disabled={enriquecendo} style={{ whiteSpace: 'nowrap' }}>
            {enriquecendo ? 'Enriquecendo…' : 'Rodar enriquecimento'}
          </button>
        </div>
      </div>

      {enrichMsg && (
        <div className="card" style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>{enrichMsg}</div>
      )}

      {data.pendentesEnriquecimento > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '10px 16px', border: '1px solid var(--yellow)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span>⚠</span>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>
            {data.pendentesEnriquecimento} lead{data.pendentesEnriquecimento > 1 ? 's' : ''} aguardando enriquecimento
          </span>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
        <KpiCard label="Conexões"        valor={data.conexoes}      />
        <KpiCard label="Aceitas"         valor={data.aceitas}       />
        <KpiCard label="Taxa aceitação"  valor={`${data.taxaAceitacao}%`} highlight color={C.green} />
        <KpiCard label="Responderam"     valor={data.responderam}   />
        <KpiCard label="Taxa resposta"   valor={`${data.taxaResposta}%`}  highlight color={C.yellow} />
        <KpiCard label="RDs marcados"    valor={data.rds}           highlight color={C.purple} />
        <KpiCard label="Contratos"       valor={data.contratos}     highlight color={C.teal} />
      </div>

      {/* Funil de conversão */}
      <div className="card" style={{ marginBottom: 20, padding: '18px 20px' }}>
        <p className="section-label" style={{ marginBottom: 16 }}>Funil de conversão — {labelMes(mes)}</p>
        {data.conexoes === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            Sem dados para este mês.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.funil} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#f1f5f9' }}
                itemStyle={{ color: C.green }}
              />
              <Bar dataKey="valor" name="Qtd" fill={C.green} radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Por membro + Histórico */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Por membro */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p className="section-label" style={{ marginBottom: 16 }}>Por membro — {labelMes(mes)}</p>
          {data.porMembro.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              Sem atividade neste mês.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.porMembro} margin={{ top: 0, right: 4, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="nome" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
                <Bar dataKey="conexoes"   name="Enviadas"   fill={C.green}  radius={[3,3,0,0]} maxBarSize={18} />
                <Bar dataKey="aceitas"    name="Aceitas"    fill={C.teal}   radius={[3,3,0,0]} maxBarSize={18} />
                <Bar dataKey="responderam" name="Respond."  fill={C.yellow} radius={[3,3,0,0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Histórico 6 meses */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <p className="section-label" style={{ marginBottom: 16 }}>Histórico — últimos 6 meses</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.historico} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#f1f5f9' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="conexoes"    name="Conexões"    stroke={C.green}  strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="responderam" name="Responderam" stroke={C.yellow} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela de membros */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="section-label">Membros — {labelMes(mes)}</p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nome', 'Conexões', 'Aceitas', 'Responderam', 'RDs', ''].map(col => (
                  <th key={col} style={{
                    textAlign: col === 'Nome' ? 'left' : 'right',
                    padding: '10px 16px', fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    color: 'var(--text-muted)', whiteSpace: 'nowrap',
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
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--cream)' }}>{m.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email}</div>
                  </td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{m.conexoes}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{m.aceitas}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', color: m.responderam > 0 ? C.green : 'var(--text-secondary)', fontWeight: m.responderam > 0 ? 700 : 400 }}>{m.responderam}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right', color: m.rds > 0 ? C.purple : 'var(--text-secondary)', fontWeight: m.rds > 0 ? 700 : 400 }}>{m.rds}</td>
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => pausarMembro(m.email, m.nome)}
                      disabled={pausando === m.email}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--yellow)', opacity: pausando === m.email ? 0.4 : 1 }}
                    >
                      {pausando === m.email ? 'Redistribuindo…' : 'Pausar'}
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

function KpiCard({ label, valor, highlight, color }: { label: string; valor: number | string; highlight?: boolean; color?: string }) {
  const c = color ?? 'var(--cream)'
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${highlight ? (color ?? 'var(--green-primary)') : 'var(--border)'}`,
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: highlight ? c : 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
        {valor}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  )
}
