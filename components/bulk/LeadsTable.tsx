'use client'
import { useState } from 'react'
import { Lead } from '@/types'

interface Props {
  leads: Lead[]
  onRegenerate: (lead: Lead) => void
  onAvaliar: (id: string, avaliacao: 'up' | 'down') => void
  onEditMensagem: (id: string, mensagem: string) => void
}

export default function LeadsTable({ leads, onRegenerate, onAvaliar, onEditMensagem }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
            {['Lead', 'Empresa', 'Mensagem Gerada', 'Chars', 'Envio', 'Ações'].map(col => (
              <th
                key={col}
                style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                  fontSize: '0.7rem',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => (
            <tr
              key={lead.id}
              style={{
                borderBottom: i < leads.length - 1 ? '1px solid var(--border-subtle, #1a1a1a)' : 'none',
                background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg-card)',
              }}
            >
              {/* Lead */}
              <td style={{ padding: '12px 16px', minWidth: '140px' }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.875rem' }}>
                  {lead.nome} {lead.sobrenome || ''}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                  {lead.cargo || '—'}
                </div>
              </td>

              {/* Empresa */}
              <td style={{ padding: '12px 16px', minWidth: '130px' }}>
                <div style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>{lead.empresa}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                  {lead.setor || '—'}
                </div>
              </td>

              {/* Mensagem */}
              <td style={{ padding: '12px 16px', maxWidth: '400px' }}>
                {lead.status === 'generating' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    <span className="spinner" /> Gerando...
                  </div>
                )}
                {lead.status === 'error' && (
                  <span style={{ color: 'var(--red)', fontSize: '0.8rem' }}>❌ Erro — clique em regenerar</span>
                )}
                {lead.status === 'pending' && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Aguardando...</span>
                )}
                {lead.status === 'done' && (
                  editingId === lead.id ? (
                    <textarea
                      defaultValue={lead.mensagem_gerada}
                      onBlur={e => { onEditMensagem(lead.id, e.target.value); setEditingId(null) }}
                      autoFocus
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        background: 'var(--bg)',
                        border: '1px solid var(--accent)',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '0.8rem',
                        padding: '8px',
                        resize: 'vertical',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    />
                  ) : (
                    <p
                      onClick={() => setEditingId(lead.id)}
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        lineHeight: '1.5',
                        cursor: 'text',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'background 0.15s',
                      }}
                      title="Clique para editar"
                    >
                      {lead.mensagem_gerada}
                    </p>
                  )
                )}
              </td>

              {/* Chars */}
              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                {lead.mensagem_gerada && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: lead.mensagem_gerada.length > 300 ? 'var(--red)' : 'var(--green)',
                    fontFamily: 'monospace',
                  }}>
                    {lead.mensagem_gerada.length}
                  </span>
                )}
              </td>

              {/* Envio */}
              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                {lead.envio === 'sending' && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><span className="spinner" /> Enviando</span>}
                {lead.envio === 'sent' && <span style={{ color: 'var(--green)', fontSize: '0.75rem', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>✓ Enviado</span>}
                {lead.envio === 'error' && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>✗ Erro</span>}
                {!lead.envio && lead.email && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{lead.email}</span>}
                {!lead.envio && !lead.email && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>}
              </td>

              {/* Ações */}
              <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {lead.status === 'done' && (
                    <>
                      <button
                        onClick={() => onAvaliar(lead.id, 'up')}
                        title="Boa mensagem"
                        style={{
                          background: lead.avaliacao === 'up' ? 'rgba(34,197,94,0.15)' : 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                        }}
                      >👍</button>
                      <button
                        onClick={() => onAvaliar(lead.id, 'down')}
                        title="Mensagem ruim"
                        style={{
                          background: lead.avaliacao === 'down' ? 'rgba(239,68,68,0.15)' : 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
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
                        borderRadius: '6px',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'Syne, sans-serif',
                      }}
                    >↺</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
