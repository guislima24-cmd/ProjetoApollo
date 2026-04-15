'use client'

import { useEffect, useState, useCallback } from 'react'
import type { RecentMemberLead } from '@/lib/sheets'

export default function RecentLeads() {
  const [leads, setLeads] = useState<RecentMemberLead[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [regenerando, setRegenerando] = useState<number | null>(null)
  const [expandido, setExpandido] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/member-leads/recent?n=10')
      const data = await res.json()
      if (!res.ok) {
        setErro(data.detalhe ?? data.error ?? 'Falha ao carregar')
        return
      }
      setLeads(data.leads)
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

  async function regenerar(lead: RecentMemberLead) {
    setRegenerando(lead.rowIndex)
    try {
      const res = await fetch('/api/member-leads/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowIndex: lead.rowIndex,
          nome: lead.nome,
          empresa: lead.empresa,
          setor: lead.setor,
          canal: lead.canal === 'LinkedIn' ? 'LinkedIn' : 'E-mail',
          linkedin_url: lead.canal === 'LinkedIn' ? lead.link : undefined,
          email: lead.canal !== 'LinkedIn' ? lead.link : undefined,
          mensagemAnterior: lead.mensagemIA,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.detalhe ?? data.error ?? 'Falha ao regenerar')
        return
      }
      // Atualiza localmente o pitch
      setLeads((prev) =>
        prev
          ? prev.map((l) =>
              l.rowIndex === lead.rowIndex ? { ...l, mensagemIA: data.mensagem } : l
            )
          : prev
      )
    } finally {
      setRegenerando(null)
    }
  }

  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18 }}>Últimos leads</h2>
        <button onClick={carregar} style={botaoSecundario}>
          Atualizar
        </button>
      </div>

      {erro && (
        <div
          style={{
            color: 'var(--red)',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {erro}
        </div>
      )}

      {!leads && !erro && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Carregando...</p>
      )}

      {leads && leads.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Nenhum lead ainda. Adicione um acima para começar.
        </p>
      )}

      {leads && leads.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {leads.map((l) => {
            const aberto = expandido === l.rowIndex
            return (
              <li
                key={l.rowIndex}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <strong style={{ fontSize: 14 }}>{l.nome || '(sem nome)'}</strong>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {l.empresa}
                      {l.setor ? ` · ${l.setor}` : ''}
                      {l.canal ? ` · ${l.canal}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setExpandido(aberto ? null : l.rowIndex)}
                      style={botaoSecundario}
                    >
                      {aberto ? 'Ocultar' : 'Ver pitch'}
                    </button>
                    <button
                      onClick={() => regenerar(l)}
                      disabled={regenerando === l.rowIndex}
                      style={{
                        ...botaoSecundario,
                        opacity: regenerando === l.rowIndex ? 0.6 : 1,
                      }}
                    >
                      {regenerando === l.rowIndex ? 'Regerando...' : 'Regerar pitch'}
                    </button>
                  </div>
                </div>
                {aberto && (
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      margin: 0,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {l.mensagemIA || '(sem pitch gerado)'}
                  </pre>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const botaoSecundario: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
}
