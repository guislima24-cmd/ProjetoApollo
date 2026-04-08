'use client'
import { useState } from 'react'
import { Lead } from '@/types'

interface Props {
  leads: Lead[]
  charLimit?: number
  onRegenerate: (lead: Lead) => void
  onAvaliar: (id: string, avaliacao: 'up' | 'down') => void
  onEditMensagem: (id: string, mensagem: string) => void
}

export default function LeadsTable({ leads, charLimit = 300, onRegenerate, onAvaliar, onEditMensagem }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {leads.map((lead) => (
        <div
          key={lead.id}
          className="fade-in"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden',
            transition: 'border-color 0.2s',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap',
            gap: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                color: 'var(--text-primary)',
                fontWeight: 600,
                fontSize: '0.95rem',
                fontFamily: 'Syne, sans-serif',
              }}>
                {lead.nome} {lead.sobrenome || ''}
              </span>
              {lead.cargo && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  · {lead.cargo}
                </span>
              )}
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                · {lead.empresa}
                {lead.setor && <span style={{ color: 'var(--text-muted)' }}> ({lead.setor})</span>}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {lead.mensagem_gerada && (
                <span style={{
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  color: lead.mensagem_gerada.length > charLimit ? 'var(--red)' : 'var(--green)',
                  background: lead.mensagem_gerada.length > charLimit ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontWeight: 600,
                }}>
                  {lead.mensagem_gerada.length}/{charLimit}
                </span>
              )}

              {lead.status === 'done' && (
                <>
                  <button
                    onClick={() => onAvaliar(lead.id, 'up')}
                    title="Boa mensagem"
                    style={{
                      background: lead.avaliacao === 'up' ? 'rgba(34,197,94,0.15)' : 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      transition: 'all 0.15s',
                    }}
                  >👍</button>
                  <button
                    onClick={() => onAvaliar(lead.id, 'down')}
                    title="Mensagem ruim"
                    style={{
                      background: lead.avaliacao === 'down' ? 'rgba(239,68,68,0.15)' : 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      transition: 'all 0.15s',
                    }}
                  >👎</button>
                </>
              )}
              {(lead.status === 'done' || lead.status === 'error') && (
                <button
                  onClick={() => onRegenerate(lead)}
                  title="Regenerar mensagem"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    fontFamily: 'Syne, sans-serif',
                    fontWeight: 600,
                    transition: 'all 0.15s',
                  }}
                >↺ Regenerar</button>
              )}
            </div>
          </div>

          {/* Body — Message */}
          <div style={{ padding: '16px 20px' }}>
            {lead.status === 'generating' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                padding: '20px 0',
              }}>
                <span className="spinner" /> Gerando mensagem...
              </div>
            )}
            {lead.status === 'error' && (
              <div style={{
                color: 'var(--red)',
                fontSize: '0.9rem',
                padding: '16px',
                background: 'rgba(239,68,68,0.05)',
                borderRadius: '8px',
              }}>
                Erro na geração — clique em Regenerar para tentar novamente
              </div>
            )}
            {lead.status === 'pending' && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Aguardando...</span>
            )}
            {lead.status === 'done' && (
              editingId === lead.id ? (
                <textarea
                  defaultValue={lead.mensagem_gerada}
                  onBlur={e => { onEditMensagem(lead.id, e.target.value); setEditingId(null) }}
                  autoFocus
                  style={{
                    width: '100%',
                    minHeight: '140px',
                    background: 'var(--bg)',
                    border: '1px solid var(--accent)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    lineHeight: '1.7',
                    padding: '16px',
                    resize: 'vertical',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                />
              ) : (
                <div
                  onClick={() => setEditingId(lead.id)}
                  style={{
                    background: 'var(--bg)',
                    borderRadius: '8px',
                    padding: '16px',
                    cursor: 'text',
                    transition: 'background 0.15s',
                  }}
                  title="Clique para editar"
                >
                  <p style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    lineHeight: '1.7',
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}>
                    {lead.mensagem_gerada}
                  </p>
                </div>
              )
            )}
          </div>

          {/* Footer — Envio status */}
          {(lead.email || lead.envio) && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              background: 'rgba(0,0,0,0.15)',
            }}>
              <div>
                {lead.email && !lead.envio && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{lead.email}</span>
                )}
              </div>
              <div>
                {lead.envio === 'sending' && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="spinner" /> Enviando...
                  </span>
                )}
                {lead.envio === 'sent' && (
                  <span style={{ color: 'var(--green)', fontSize: '0.8rem', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>
                    ✓ Enviado
                  </span>
                )}
                {lead.envio === 'error' && (
                  <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>✗ Erro no envio</span>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
