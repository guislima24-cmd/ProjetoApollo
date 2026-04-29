'use client'

import { useState, useTransition } from 'react'
import type { ProspectionStatus } from '@/types'

type Prospection = {
  rowIndex: number
  dataEnvio: string
  canal: 'Email' | 'LinkedIn'
  empresa: string
  setor?: string
  nome: string
  cargo?: string
  contato?: string
  status: string
  observacoes?: string
  mensagem_ia?: string
  memberTab?: string
}

const STATUS_OPTIONS: ProspectionStatus[] = ['Aguardando', 'Respondeu', 'Reunião', 'Follow-up', 'Descartado']

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Aguardando:  { bg: '#141414',   color: '#5a5550', border: '#242424' },
  Respondeu:   { bg: '#0d2e17',   color: '#22c55e', border: '#166534' },
  'Reunião':   { bg: '#0f2c18',   color: '#4ade80', border: '#317039' },
  'Follow-up': { bg: '#2e2208',   color: '#F1BE49', border: '#ca8a04' },
  Descartado:  { bg: '#2e0d0d',   color: '#ef4444', border: '#991b1b' },
}

export default function DashboardClient({
  initialProspections,
  memberTab,
  isAdmin,
  allTabs,
}: {
  initialProspections: Prospection[]
  memberTab: string
  isAdmin: boolean
  allTabs: string[]
}) {
  const [prospects, setProspects] = useState(initialProspections)
  const [statusFilter, setStatusFilter] = useState<string>('Todos')
  const [memberFilter, setMemberFilter] = useState<string>('Todos')
  const [isPending, startTransition] = useTransition()

  async function handleStatusChange(rowIndex: number, newStatus: ProspectionStatus, tab?: string) {
    try {
      const res = await fetch(`/api/prospection/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, memberTab: tab }),
      })
      if (!res.ok) return
      startTransition(() => {
        setProspects(prev =>
          prev.map(p => p.rowIndex === rowIndex && p.memberTab === tab ? { ...p, status: newStatus } : p)
        )
      })
    } catch (err) {
      console.error('Erro ao atualizar status:', err)
    }
  }

  const statusFilters = ['Todos', ...STATUS_OPTIONS]

  const filtered = prospects.filter(p => {
    const matchStatus = statusFilter === 'Todos' || p.status === statusFilter
    const matchMember = !isAdmin || memberFilter === 'Todos' || p.memberTab === memberFilter
    return matchStatus && matchMember
  })

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Header com filtros */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap', gap: 10,
      }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Prospecções ({filtered.length})
        </h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Filtro por membro (só para admins) */}
          {isAdmin && (
            <select
              value={memberFilter}
              onChange={e => setMemberFilter(e.target.value)}
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: '#0a0a0a',
                color: memberFilter !== 'Todos' ? 'var(--green-primary)' : 'var(--text-muted)',
                cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="Todos">Todos os membros</option>
              {allTabs.map(tab => <option key={tab} value={tab}>{tab}</option>)}
            </select>
          )}

          {/* Filtro por status */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {statusFilters.map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '4px 10px',
                  borderRadius: 6, border: '1px solid', cursor: 'pointer',
                  transition: 'all 0.12s',
                  background: statusFilter === f ? 'var(--green-primary)' : 'transparent',
                  color: statusFilter === f ? 'var(--cream)' : 'var(--text-muted)',
                  borderColor: statusFilter === f ? 'var(--green-primary)' : 'var(--border)',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            Nenhuma prospecção encontrada
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[
                  'Data', 'Canal',
                  ...(isAdmin ? ['Membro'] : []),
                  'Nome', 'Cargo', 'Empresa', 'Status', 'Contato'
                ].map(col => (
                  <th key={col} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.07em', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const style = STATUS_STYLE[p.status] ?? STATUS_STYLE.Aguardando
                return (
                  <tr
                    key={`${p.memberTab ?? ''}-${p.rowIndex}-${i}`}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {p.dataEnvio || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
                        background: p.canal === 'LinkedIn' ? 'rgba(10,102,194,0.15)' : 'rgba(241,190,73,0.1)',
                        color: p.canal === 'LinkedIn' ? '#4fa3e0' : '#F1BE49',
                      }}>
                        {p.canal}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {p.memberTab || '—'}
                      </td>
                    )}
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--cream)', whiteSpace: 'nowrap' }}>
                      {p.nome || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.cargo || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.empresa || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <select
                        value={p.status}
                        onChange={e => handleStatusChange(p.rowIndex, e.target.value as ProspectionStatus, p.memberTab)}
                        disabled={isPending}
                        style={{
                          fontSize: 11, fontWeight: 600, padding: '3px 8px',
                          borderRadius: 6, border: `1px solid ${style.border}`,
                          background: style.bg, color: style.color,
                          cursor: 'pointer', outline: 'none', appearance: 'none',
                        }}
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {p.contato ? (
                        <a href={p.contato} target="_blank" rel="noreferrer"
                          style={{ color: 'var(--green-primary)', fontSize: 12, textDecoration: 'none' }}>
                          Ver perfil ↗
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
