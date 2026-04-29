'use client'

import { useEffect, useState, useCallback } from 'react'
import type { ProspectionRecord, ProspectionStatus } from '@/types'

interface RecentProspection extends ProspectionRecord {
  rowIndex: number
  dataEnvio: string
  status: ProspectionStatus | string
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Aguardando: { bg: 'rgba(241,190,73,0.12)',  color: '#F1BE49' },
  Respondeu:  { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e' },
  'Reunião':  { bg: 'rgba(49,112,57,0.2)',    color: '#6ee87c' },
  'Follow-up':{ bg: 'rgba(99,102,241,0.12)',  color: '#a5b4fc' },
  Descartado: { bg: 'rgba(239,68,68,0.1)',    color: '#ef4444' },
}

export default function RecentLeads() {
  const [leads, setLeads] = useState<RecentProspection[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<number | null>(null)
  const [copiado, setCopiado] = useState<number | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/prospection')
      const data = await res.json()
      if (!res.ok) {
        setErro(data.error ?? 'Falha ao carregar')
        return
      }
      setLeads(data.prospections)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar recentes')
    }
  }, [])

  useEffect(() => {
    carregar()
    const onAdded = () => carregar()
    window.addEventListener('apollo:lead-added', onAdded)
    return () => window.removeEventListener('apollo:lead-added', onAdded)
  }, [carregar])

  const verificarRespostas = async () => {
    setSincronizando(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/gmail/sync')
      const data = await res.json()
      if (data.updated?.length > 0) {
        setSyncMsg(`✓ ${data.updated.length} lead(s) atualizado(s) para "Respondeu"`)
        await carregar()
      } else {
        setSyncMsg(`Nenhuma resposta nova encontrada (${data.checked ?? 0} verificados)`)
      }
      setTimeout(() => setSyncMsg(null), 5000)
    } catch {
      setSyncMsg('Erro ao verificar respostas')
    } finally {
      setSincronizando(false)
    }
  }

  function copiar(mensagem: string, rowIndex: number) {
    navigator.clipboard.writeText(mensagem)
    setCopiado(rowIndex)
    setTimeout(() => setCopiado(null), 2000)
  }

  return (
    <section style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 18 }}>Últimas prospecções</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {syncMsg && (
            <span style={{ fontSize: 12, color: syncMsg.startsWith('✓') ? 'var(--green)' : 'var(--text-muted)' }}>
              {syncMsg}
            </span>
          )}
          <button
            onClick={verificarRespostas}
            disabled={sincronizando}
            style={{ ...btnSecondary, color: 'var(--green-primary)', borderColor: 'var(--green-primary)' }}
          >
            {sincronizando ? '⟳ Verificando...' : '↺ Verificar Respostas'}
          </button>
          <button onClick={carregar} style={btnSecondary}>Atualizar</button>
        </div>
      </div>

      {erro && (
        <div style={{
          color: 'var(--red)',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
        }}>
          {erro}
        </div>
      )}

      {!leads && !erro && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
      )}

      {leads?.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Nenhuma prospecção registrada ainda.
        </p>
      )}

      {leads && leads.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leads.map((l) => {
            const aberto = expandido === l.rowIndex
            const statusStyle = STATUS_STYLE[l.status] ?? STATUS_STYLE.Aguardando
            return (
              <li key={l.rowIndex} style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                {/* Linha principal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{l.nome || '(sem nome)'}</strong>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 100,
                        background: statusStyle.bg,
                        color: statusStyle.color,
                      }}>
                        {l.status}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {l.empresa}
                      {l.setor ? ` · ${l.setor}` : ''}
                      {l.cargo ? ` · ${l.cargo}` : ''}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {l.canal} · {l.dataEnvio}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start' }}>
                    {l.mensagem_ia && (
                      <button
                        onClick={() => setExpandido(aberto ? null : l.rowIndex)}
                        style={btnSecondary}
                      >
                        {aberto ? 'Ocultar' : 'Ver mensagem'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Mensagem expandida */}
                {aberto && l.mensagem_ia && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <pre style={{
                      whiteSpace: 'pre-wrap',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      margin: 0,
                      color: 'var(--text-primary)',
                      lineHeight: 1.6,
                    }}>
                      {l.mensagem_ia}
                    </pre>
                    <button
                      onClick={() => copiar(l.mensagem_ia!, l.rowIndex)}
                      style={{
                        ...btnSecondary,
                        borderColor: copiado === l.rowIndex ? 'var(--green-primary)' : undefined,
                        color: copiado === l.rowIndex ? 'var(--green)' : undefined,
                        alignSelf: 'flex-start',
                      }}
                    >
                      {copiado === l.rowIndex ? '✓ Copiado!' : 'Copiar mensagem'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
