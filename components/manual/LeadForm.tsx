'use client'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { ManualLead, CampaignConfig } from '@/types'

const defaultConfig: CampaignConfig = {
  metodologia: 'AIDA',
  tom: 'Semiformal',
  canal: 'LinkedIn',
  limite_caracteres: 300,
  ia: 'gemini',
}

// ── Pill selector ─────────────────────────────────────────────────────────────
function Pills<T extends string>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding:      '6px 14px',
              borderRadius: 100,
              border:       `1px solid ${value === o.value ? 'var(--green-primary)' : 'var(--border)'}`,
              background:   value === o.value ? 'rgba(49,112,57,0.18)' : 'transparent',
              color:        value === o.value ? 'var(--cream)' : 'var(--text-muted)',
              fontSize:     12,
              fontFamily:   'Syne, sans-serif',
              fontWeight:   700,
              cursor:       'pointer',
              transition:   'all 0.15s',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Input / Label helpers ────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width:        '100%',
  background:   '#0a0a0a',
  border:       '1px solid var(--border)',
  borderRadius: 8,
  color:        'var(--text-primary)',
  padding:      '10px 13px',
  fontSize:     '0.875rem',
  fontFamily:   'DM Sans, sans-serif',
  outline:      'none',
  transition:   'border-color 0.15s',
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--gold)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export default function LeadForm() {
  const [config, setConfig] = useState<CampaignConfig>(defaultConfig)
  const [lead, setLead]     = useState<ManualLead>({ nome: '', cargo: '', empresa: '', setor: '', tamanho: '', cidade: '', contexto_extra: '' })
  const [mensagem, setMensagem]   = useState('')
  const [historico, setHistorico] = useState<string[]>([])
  const [loading, setLoading]     = useState(false)
  const [genError, setGenError]   = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registered, setRegistered]   = useState(false)
  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [emailTo, setEmailTo]     = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const { data: session } = useSession()

  const update = (key: keyof ManualLead, value: string) =>
    setLead(prev => ({ ...prev, [key]: value }))

  const gerar = async () => {
    if (!lead.nome || !lead.empresa || !lead.cargo || !lead.setor) return
    setLoading(true)
    setGenError(null)
    try {
      const res  = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'manual', config, lead }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setGenError(data.error ?? 'Erro ao gerar mensagem. Tente novamente.')
      } else if (data.mensagem) {
        if (mensagem) setHistorico(prev => [mensagem, ...prev.slice(0, 4)])
        setMensagem(data.mensagem)
      }
    } catch {
      setGenError('Falha de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const copiar = () => {
    navigator.clipboard.writeText(mensagem)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const registrar = async () => {
    if (!mensagem || !session?.user?.memberTab) return
    setRegistering(true)
    try {
      const res = await fetch('/api/prospection', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nome: lead.nome, empresa: lead.empresa, cargo: lead.cargo, setor: lead.setor, canal: config.canal, contato: '', mensagem_ia: mensagem }),
      })
      if (res.ok) { setRegistered(true); setTimeout(() => setRegistered(false), 4000) }
    } finally {
      setRegistering(false)
    }
  }

  const enviarEmail = async () => {
    if (!mensagem || !emailTo || !session?.user?.memberTab) return
    setSending(true)
    try {
      const res = await fetch('/api/gmail/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ to: emailTo, subject: emailSubject || `Olá, ${lead.nome} — UFABC Júnior`, message: mensagem, nome: lead.nome, empresa: lead.empresa, cargo: lead.cargo, setor: lead.setor }),
      })
      if (res.ok) {
        setSent(true); setRegistered(true)
        setTimeout(() => { setSent(false); setRegistered(false) }, 5000)
      } else {
        const err = await res.json()
        alert(`Erro ao enviar: ${err.error}`)
      }
    } finally {
      setSending(false)
    }
  }

  const required = !lead.nome || !lead.empresa || !lead.cargo || !lead.setor
  const charColor = mensagem.length > config.limite_caracteres ? 'var(--red)' : 'var(--green)'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

      {/* ── Coluna esquerda: inputs + config ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Dados do Lead */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--green-primary)', marginBottom: 16 }}>
            Dados do Lead
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nome" required>
              <input className="input" placeholder="João Silva" value={lead.nome} onChange={e => update('nome', e.target.value)} />
            </Field>
            <Field label="Cargo" required>
              <input className="input" placeholder="CEO, Gerente..." value={lead.cargo} onChange={e => update('cargo', e.target.value)} />
            </Field>
            <Field label="Empresa" required>
              <input className="input" placeholder="Empresa X" value={lead.empresa} onChange={e => update('empresa', e.target.value)} />
            </Field>
            <Field label="Setor" required>
              <input className="input" placeholder="Tecnologia..." value={lead.setor} onChange={e => update('setor', e.target.value)} />
            </Field>
            <Field label="Funcionários">
              <input className="input" placeholder="150" value={lead.tamanho} onChange={e => update('tamanho', e.target.value)} />
            </Field>
            <Field label="Cidade">
              <input className="input" placeholder="São Paulo" value={lead.cidade} onChange={e => update('cidade', e.target.value)} />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Contexto extra">
              <textarea
                className="input"
                style={{ minHeight: 88, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="Conquistas recentes, posts do LinkedIn, expansões, prêmios..."
                value={lead.contexto_extra}
                onChange={e => update('contexto_extra', e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Configuração */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--green-primary)' }}>
            Configuração
          </div>

          {/* IA selector */}
          <div style={{ background: '#0a0a0a', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 10 }}>
              Modelo de IA
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: 'gemini', label: 'Gemini Flash', sub: 'Grátis', icon: '◈' },
                { value: 'claude', label: 'Claude Haiku', sub: '~$0,001/msg', icon: '◆' },
              ] as const).map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, ia: o.value }))}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 8,
                    border:     `1px solid ${config.ia === o.value ? (o.value === 'gemini' ? '#4285f4' : 'var(--gold)') : 'var(--border)'}`,
                    background: config.ia === o.value ? (o.value === 'gemini' ? 'rgba(66,133,244,0.1)' : 'rgba(241,190,73,0.08)') : 'transparent',
                    color:      config.ia === o.value ? (o.value === 'gemini' ? '#7ab3f7' : 'var(--gold)') : 'var(--text-muted)',
                    fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.15s', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{o.icon}</span>
                  <span>
                    {o.label}
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>{o.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Pills
            label="Canal"
            value={config.canal}
            options={[{ value: 'LinkedIn', label: 'LinkedIn' }, { value: 'Email', label: 'Email' }]}
            onChange={c => setConfig(prev => ({ ...prev, canal: c, limite_caracteres: c === 'LinkedIn' ? 300 : 1500 }))}
          />
          <Pills
            label="Tom"
            value={config.tom}
            options={[{ value: 'Formal', label: 'Formal' }, { value: 'Semiformal', label: 'Semiformal' }, { value: 'Direto', label: 'Direto' }]}
            onChange={t => setConfig(prev => ({ ...prev, tom: t }))}
          />
          <Pills
            label="Metodologia"
            value={config.metodologia}
            options={[{ value: 'CLASSICA', label: 'Clássica' }, { value: 'AIDA', label: 'AIDA' }]}
            onChange={m => setConfig(prev => ({ ...prev, metodologia: m }))}
          />
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Limite</span>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--gold)' }}>{config.limite_caracteres} chars</span>
            </div>
            <input type="range" min={100} max={2000} step={50} value={config.limite_caracteres}
              onChange={e => setConfig(prev => ({ ...prev, limite_caracteres: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: 'var(--green-primary)' }} />
          </div>
        </div>

        {/* Botão gerar */}
        <button
          onClick={gerar}
          disabled={loading || required}
          className="btn-primary"
          style={{ padding: '15px', fontSize: '1rem', borderRadius: 10, width: '100%', opacity: required ? 0.4 : 1, cursor: required ? 'not-allowed' : 'pointer' }}
        >
          {loading ? <><span className="spinner" /> Gerando...</> : '✦ Gerar Mensagem'}
        </button>

        {genError && (
          <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>
            ⚠ {genError}
          </div>
        )}
      </div>

      {/* ── Coluna direita: mensagem + ações ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 72 }}>

        {!mensagem ? (
          <div style={{ background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 12, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 320 }}>
            <span style={{ fontSize: 32, opacity: 0.3 }}>✦</span>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', lineHeight: 1.6 }}>
              Preencha os dados do lead<br />e clique em Gerar Mensagem
            </p>
          </div>
        ) : (
          <div className="fade-in" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Header da mensagem */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--green-primary)' }}>
                Mensagem Gerada
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: charColor }}>
                  {mensagem.length}/{config.limite_caracteres}
                </span>
                <button
                  onClick={gerar}
                  disabled={loading}
                  style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'Syne, sans-serif', cursor: 'pointer' }}
                >
                  ↺
                </button>
                <button
                  onClick={copiar}
                  style={{ background: copied ? 'rgba(34,197,94,0.15)' : 'var(--green-primary)', border: `1px solid ${copied ? 'var(--green)' : 'var(--green-primary)'}`, borderRadius: 6, padding: '5px 12px', color: copied ? 'var(--green)' : 'var(--cream)', fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Textarea da mensagem */}
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', padding: '16px 18px', fontSize: '0.875rem', lineHeight: 1.7, minHeight: 220, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
            />

            {/* Ações */}
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {config.canal !== 'Email' && session?.user?.memberTab && (
                <button
                  onClick={registrar}
                  disabled={registering || registered}
                  style={{ flex: 1, background: registered ? 'rgba(34,197,94,0.1)' : 'transparent', border: `1px solid ${registered ? 'var(--green)' : 'var(--border)'}`, borderRadius: 8, padding: '10px', color: registered ? 'var(--green)' : 'var(--text-secondary)', fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 700, cursor: registering || registered ? 'default' : 'pointer', transition: 'all 0.2s' }}
                >
                  {registering ? '...' : registered ? '✓ Registrado na planilha' : '+ Registrar na planilha'}
                </button>
              )}
            </div>

            {/* Email fields */}
            {config.canal === 'Email' && session?.user?.memberTab && (
              <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Email do destinatário">
                    <input className="input" type="email" placeholder="lead@empresa.com" value={emailTo} onChange={e => setEmailTo(e.target.value)} />
                  </Field>
                  <Field label="Assunto">
                    <input className="input" placeholder={`Olá, ${lead.nome || 'Lead'} — UFABC Júnior`} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                  </Field>
                </div>
                <button
                  onClick={enviarEmail}
                  disabled={sending || sent || !emailTo}
                  className="btn-primary"
                  style={{ width: '100%', padding: 12, opacity: !emailTo ? 0.4 : 1, background: sent ? 'rgba(34,197,94,0.15)' : undefined, color: sent ? 'var(--green)' : undefined, border: sent ? '1px solid var(--green)' : undefined }}
                >
                  {sending ? <><span className="spinner" /> Enviando...</> : sent ? '✓ Email enviado e registrado!' : '✉ Enviar por Email'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Histórico */}
        {historico.length > 0 && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 12 }}>
              Versões anteriores
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {historico.map((msg, i) => (
                <div key={i} style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5 }}>{msg.slice(0, 120)}...</p>
                  <button
                    onClick={() => setMensagem(msg)}
                    style={{ color: 'var(--green-primary)', fontSize: '0.7rem', marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
