'use client'
import { useState } from 'react'
import { ManualLead, CampaignConfig } from '@/types'
import CampaignConfigPanel from '../bulk/CampaignConfig'

const defaultConfig: CampaignConfig = {
  metodologia: 'AIDA',
  tom: 'Semiformal',
  canal: 'LinkedIn',
  limite_caracteres: 300,
}

export default function LeadForm() {
  const [config, setConfig] = useState<CampaignConfig>(defaultConfig)
  const [lead, setLead] = useState<ManualLead>({
    nome: '', cargo: '', empresa: '', setor: '',
    tamanho: '', cidade: '', contexto_extra: '',
  })
  const [mensagem, setMensagem] = useState('')
  const [historico, setHistorico] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const update = (key: keyof ManualLead, value: string) => {
    setLead(prev => ({ ...prev, [key]: value }))
  }

  const gerar = async (regenerar = false) => {
    if (!lead.nome || !lead.empresa || !lead.cargo || !lead.setor) return
    setLoading(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'manual', config, lead }),
      })
      const data = await res.json()
      if (data.mensagem) {
        if (mensagem) setHistorico(prev => [mensagem, ...prev.slice(0, 4)])
        setMensagem(data.mensagem)
      }
    } finally {
      setLoading(false)
    }
  }

  const copiar = () => {
    navigator.clipboard.writeText(mensagem)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    fontSize: '0.875rem',
    fontFamily: 'DM Sans, sans-serif',
    outline: 'none',
  }

  const labelStyle = {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: '0.7rem',
    fontFamily: 'Syne, sans-serif',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    marginBottom: '6px',
  }

  const required = !lead.nome || !lead.empresa || !lead.cargo || !lead.setor

  return (
    <div className="space-y-6">
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} className="rounded-xl p-6 space-y-4">
        <h3 style={{ fontFamily: 'Syne, sans-serif', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Dados do Lead ({config.canal})
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Nome Completo *</label>
            <input style={inputStyle} placeholder="Ex: João Silva" value={lead.nome} onChange={e => update('nome', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Cargo *</label>
            <input style={inputStyle} placeholder="Ex: CEO, Gerente de Operações" value={lead.cargo} onChange={e => update('cargo', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Empresa *</label>
            <input style={inputStyle} placeholder="Ex: Empresa X" value={lead.empresa} onChange={e => update('empresa', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Setor *</label>
            <input style={inputStyle} placeholder="Ex: Manufatura, Tecnologia" value={lead.setor} onChange={e => update('setor', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Funcionários</label>
            <input style={inputStyle} placeholder="Ex: 150" value={lead.tamanho} onChange={e => update('tamanho', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Cidade</label>
            <input style={inputStyle} placeholder="Ex: São Paulo" value={lead.cidade} onChange={e => update('cidade', e.target.value)} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>
            Contexto Extra {config.canal === 'LinkedIn' ? 'do Perfil LinkedIn' : 'do Lead'}
            <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>— quanto mais, melhor</span>
          </label>
          <textarea
            style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', lineHeight: '1.5' }}
            placeholder="Cole aqui informações do perfil: conquistas recentes, posts, projetos em andamento, tempo na empresa, expansões, prêmios..."
            value={lead.contexto_extra}
            onChange={e => update('contexto_extra', e.target.value)}
          />
        </div>
      </div>

      <CampaignConfigPanel config={config} onChange={setConfig} />

      <button
        onClick={() => gerar()}
        disabled={loading || required}
        style={{
          width: '100%',
          background: required ? 'var(--bg-card)' : 'var(--accent)',
          color: required ? 'var(--text-muted)' : '#000',
          border: 'none',
          borderRadius: '10px',
          padding: '16px',
          fontFamily: 'Syne, sans-serif',
          fontWeight: 700,
          fontSize: '1rem',
          cursor: required || loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {loading ? <><span className="spinner" /> Gerando...</> : '✦ Gerar Mensagem'}
      </button>

      {mensagem && (
        <div className="fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--accent)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Mensagem Gerada
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: mensagem.length > config.limite_caracteres ? 'var(--red)' : 'var(--green)',
              }}>
                {mensagem.length}/{config.limite_caracteres}
              </span>
              <button
                onClick={() => gerar(true)}
                disabled={loading}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontFamily: 'Syne, sans-serif',
                  cursor: 'pointer',
                }}
              >↺ Regenerar</button>
              <button
                onClick={copiar}
                style={{
                  background: copied ? 'var(--green)' : 'var(--accent)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  color: copied ? '#fff' : '#000',
                  fontSize: '0.85rem',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {copied ? '✓ Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
          <textarea
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              padding: '12px',
              fontSize: '0.875rem',
              lineHeight: '1.6',
              minHeight: '120px',
              resize: 'vertical',
              fontFamily: 'DM Sans, sans-serif',
            }}
          />
        </div>
      )}

      {historico.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <h4 style={{ color: 'var(--text-muted)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Histórico da Sessão
          </h4>
          <div className="space-y-3">
            {historico.map((msg, i) => (
              <div key={i} style={{ borderLeft: '2px solid var(--border)', paddingLeft: '12px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.5' }}>{msg}</p>
                <button
                  onClick={() => { setMensagem(msg) }}
                  style={{ color: 'var(--accent)', fontSize: '0.7rem', marginTop: '4px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}
                >
                  Restaurar esta versão
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
