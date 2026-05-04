'use client'

import { useState, useRef, useCallback } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Potencial = 'alto' | 'medio' | 'baixo'

interface DiscoveredLead {
  empresa:            string
  cnpj:               string
  setor:              string
  porte:              string
  cidade:             string
  email?:             string | null
  telefone?:          string | null
  linkedin_url?:      string | null
  funcionarios?:      number | null
  decisores?:         string[]
  potencial?:         Potencial | null
  justificativa?:     string | null
  dores_tipicas?:     string[]
  servicos_sugeridos?: string[]
  argumento_abertura?: string | null
  status?:            string
}

// ── Constantes ────────────────────────────────────────────────────────────────

const REGIOES = [
  'Santo André', 'São Bernardo', 'São Caetano',
  'Mauá', 'Ribeirão Pires', 'Diadema', 'São Paulo Capital',
]

const PORTES = ['MEI', 'ME', 'EPP', 'Médio porte']

const SETORES_SUGESTOES = [
  'TI / Software', 'Construção civil', 'Indústria química',
  'Manufatura / Indústria', 'Saúde', 'Educação', 'Consultoria', 'Alimentos',
]

// ── Helpers de UI ─────────────────────────────────────────────────────────────

function potencialBadge(p?: Potencial | null) {
  if (p === 'alto')  return { text: '🔥 Alto',  bg: 'rgba(239,68,68,0.12)',   color: '#f87171' }
  if (p === 'medio') return { text: '♨ Médio', bg: 'rgba(241,190,73,0.12)',  color: 'var(--gold)' }
  if (p === 'baixo') return { text: '❄ Baixo', bg: 'rgba(79,163,224,0.12)', color: '#60a5fa' }
  return null
}

function CheckBox({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: checked ? 'var(--cream)' : 'var(--text-secondary)' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: `1.5px solid ${checked ? 'var(--green-primary)' : 'var(--border)'}`,
          background: checked ? 'var(--green-primary)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        {checked && <span style={{ color: 'var(--cream)', fontSize: 10, lineHeight: 1 }}>✓</span>}
      </div>
      {label}
    </label>
  )
}

function LeadCard({ lead, expanded, onToggle }: {
  lead: DiscoveredLead
  expanded: boolean
  onToggle: () => void
}) {
  const badge = potencialBadge(lead.potencial)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Linha principal */}
      <div
        style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
        onClick={onToggle}
      >
        {/* Nome + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--cream)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
              {lead.empresa}
            </span>
            {badge && (
              <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, padding: '2px 9px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                {badge.text}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lead.cnpj}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📍 {lead.cidade}</span>
            {lead.porte && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lead.porte}</span>}
            {lead.funcionarios && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>👥 {lead.funcionarios}</span>
            )}
          </div>
        </div>

        {/* Ícones rápidos */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {lead.email     && <span title="Email"    style={{ fontSize: 14 }}>✉</span>}
          {lead.linkedin_url && <span title="LinkedIn" style={{ fontSize: 14 }}>in</span>}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expansão */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }} className="fade-in">

          {/* Contatos */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {lead.email && (
              <a href={`mailto:${lead.email}`} style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none' }}>✉ {lead.email}</a>
            )}
            {lead.telefone && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📞 {lead.telefone}</span>
            )}
            {lead.linkedin_url && (
              <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none' }}>
                LinkedIn ↗
              </a>
            )}
          </div>

          {/* Setor */}
          {lead.setor && (
            <div>
              <span className="section-label">Setor</span>
              <p style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{lead.setor}</p>
            </div>
          )}

          {/* Decisores */}
          {(lead.decisores ?? []).length > 0 && (
            <div>
              <span className="section-label">Decisores</span>
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {lead.decisores!.map((d, i) => (
                  <span key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>• {d}</span>
                ))}
              </div>
            </div>
          )}

          {/* Análise IA */}
          {lead.potencial && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(lead.dores_tipicas ?? []).length > 0 && (
                <div>
                  <span className="section-label" style={{ color: '#f87171' }}>Dores Típicas</span>
                  <ul style={{ marginTop: 4, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {lead.dores_tipicas!.map((d, i) => (
                      <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                        <span style={{ color: '#f87171' }}>!</span>{d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(lead.servicos_sugeridos ?? []).length > 0 && (
                <div>
                  <span className="section-label" style={{ color: '#6ee87c' }}>Serviços Sugeridos</span>
                  <ul style={{ marginTop: 4, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {lead.servicos_sugeridos!.map((s, i) => (
                      <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                        <span style={{ color: '#6ee87c' }}>✓</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Argumento de abertura */}
          {lead.argumento_abertura && (
            <div style={{ background: 'rgba(49,112,57,0.08)', border: '1px solid rgba(49,112,57,0.2)', borderRadius: 8, padding: '10px 12px' }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 5 }}>Argumento de Abertura</span>
              <p style={{ fontSize: 13, color: 'var(--cream)', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{lead.argumento_abertura}"
              </p>
            </div>
          )}

          {/* Justificativa */}
          {lead.justificativa && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {lead.justificativa}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function DescobertaPage() {
  const [setor,      setSetor]      = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [regioes,    setRegioes]    = useState<string[]>(['Santo André', 'São Bernardo'])
  const [portes,     setPortes]     = useState<string[]>(['ME', 'EPP'])
  const [outroRegiao, setOutroRegiao] = useState('')
  const [quantidade, setQuantidade] = useState(30)

  const [running,   setRunning]   = useState(false)
  const [leads,     setLeads]     = useState<DiscoveredLead[]>([])
  const [progress,  setProgress]  = useState({ current: 0, total: 0 })
  const [statusMsg, setStatusMsg] = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [done,      setDone]      = useState(false)
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set())

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  const toggleRegiao = (r: string, checked: boolean) =>
    setRegioes(prev => checked ? [...prev, r] : prev.filter(x => x !== r))

  const togglePorte = (p: string, checked: boolean) =>
    setPortes(prev => checked ? [...prev, p] : prev.filter(x => x !== p))

  const toggleExpanded = useCallback((cnpj: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(cnpj) ? next.delete(cnpj) : next.add(cnpj)
      return next
    })
  }, [])

  const handleStop = () => {
    readerRef.current?.cancel()
    setRunning(false)
    setStatusMsg('Busca interrompida.')
  }

  const handleSubmit = async () => {
    if (!setor.trim()) { setError('Informe o setor para busca.'); return }
    const allRegioes = [...regioes, ...(outroRegiao.trim() ? [outroRegiao.trim()] : [])]
    if (allRegioes.length === 0) { setError('Selecione ao menos uma região.'); return }

    setRunning(true)
    setLeads([])
    setExpanded(new Set())
    setError(null)
    setDone(false)
    setProgress({ current: 0, total: 0 })
    setStatusMsg('Iniciando pipeline…')

    try {
      const res = await fetch('/api/descoberta', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ setor, regioes: allRegioes, portes, limite: quantidade }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(data.error ?? `Erro ${res.status}`)
        setRunning(false)
        return
      }

      const reader  = res.body!.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          let event = 'message'
          let data  = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            if (line.startsWith('data: '))  data  = line.slice(6).trim()
          }
          if (!data) continue

          try {
            const payload = JSON.parse(data) as Record<string, unknown>
            switch (event) {
              case 'status':
                setStatusMsg(String(payload.message ?? ''))
                break
              case 'total':
                setProgress(p => ({ ...p, total: Number(payload.count) }))
                break
              case 'lead':
                setLeads(prev => [...prev, payload as unknown as DiscoveredLead])
                setProgress(p => ({ ...p, current: p.current + 1 }))
                break
              case 'error':
                setError(String(payload.message ?? 'Erro desconhecido'))
                break
              case 'done':
                setDone(true)
                setStatusMsg(`Concluído — ${Number(payload.count)} leads descobertos.`)
                break
            }
          } catch { /* chunk inválido — ignorar */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Falha de conexão. Verifique sua internet e tente novamente.')
      }
    } finally {
      setRunning(false)
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  const altoCount  = leads.filter(l => l.potencial === 'alto').length
  const medioCount = leads.filter(l => l.potencial === 'medio').length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <main style={{ maxWidth: 1020, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.65rem', marginBottom: 6 }}>
            Descobrir <span style={{ color: 'var(--gold)' }}>Leads</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Busca automática de empresas via CNPJ público + enriquecimento LinkedIn + análise por IA.
          </p>
        </div>

        {/* ── Formulário de filtros ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* Coluna esquerda */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Setor */}
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                  Setor / CNAE <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  className="input"
                  value={setor}
                  onChange={e => { setSetor(e.target.value); setShowSuggest(true) }}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                  onFocus={() => setShowSuggest(true)}
                  placeholder="Ex: Construção civil, TI, Saúde…"
                />
                {showSuggest && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 8, marginTop: 4, overflow: 'hidden',
                  }}>
                    {SETORES_SUGESTOES
                      .filter(s => !setor || s.toLowerCase().includes(setor.toLowerCase()))
                      .map(s => (
                        <div
                          key={s}
                          onMouseDown={() => { setSetor(s); setShowSuggest(false) }}
                          style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)', transition: 'background 0.1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          {s}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Regiões */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                  Região
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {REGIOES.map(r => (
                    <CheckBox key={r} label={r} checked={regioes.includes(r)} onChange={v => toggleRegiao(r, v)} />
                  ))}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <CheckBox label="Outro:" checked={!!outroRegiao} onChange={() => {}} />
                    <input
                      className="input"
                      value={outroRegiao}
                      onChange={e => setOutroRegiao(e.target.value)}
                      placeholder="Cidade personalizada"
                      style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna direita */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Porte */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                  Porte
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {PORTES.map(p => (
                    <CheckBox key={p} label={p} checked={portes.includes(p)} onChange={v => togglePorte(p, v)} />
                  ))}
                </div>
              </div>

              {/* Quantidade */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                    Máx. de leads
                  </label>
                  <span style={{ fontSize: 14, fontFamily: 'Syne, sans-serif', fontWeight: 800, color: 'var(--gold)' }}>{quantidade}</span>
                </div>
                <input
                  type="range" min={10} max={100} step={5} value={quantidade}
                  onChange={e => setQuantidade(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--green-primary)', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>10</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>100</span>
                </div>
              </div>
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div style={{ marginTop: 16, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13 }}>
              ⚠ {error}
            </div>
          )}

          {/* Botões */}
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button
              onClick={handleSubmit}
              disabled={running}
              className="btn-primary"
              style={{ flex: 1, padding: '13px', fontSize: '0.95rem', borderRadius: 10 }}
            >
              {running
                ? <><span className="spinner" style={{ marginRight: 8 }} />Descobrindo leads…</>
                : '✦ Descobrir Leads'}
            </button>
            {running && (
              <button onClick={handleStop} className="btn-secondary" style={{ padding: '13px 18px' }}>
                Parar
              </button>
            )}
          </div>
        </div>

        {/* ── Progresso ── */}
        {(running || leads.length > 0) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{statusMsg}</span>
              {progress.total > 0 && (
                <span style={{ fontSize: 13, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--cream)' }}>
                  {progress.current}/{progress.total}
                </span>
              )}
            </div>
            {progress.total > 0 && (
              <div style={{ background: 'var(--bg-card)', borderRadius: 100, height: 5, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green-primary)', borderRadius: 100, transition: 'width 0.4s ease' }} />
              </div>
            )}
          </div>
        )}

        {/* ── Sumário ── */}
        {done && leads.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }} className="fade-in">
            {[
              { label: 'Total descobertos', value: leads.length, color: 'var(--cream)' },
              { label: '🔥 Potencial alto',  value: altoCount,   color: '#f87171' },
              { label: '♨ Potencial médio', value: medioCount,  color: 'var(--gold)' },
              { label: 'Com email',          value: leads.filter(l => l.email).length, color: '#60a5fa' },
              { label: 'Com LinkedIn',       value: leads.filter(l => l.linkedin_url).length, color: '#60a5fa' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', textAlign: 'center', flex: '1 1 120px' }}>
                <div style={{ fontSize: 20, fontFamily: 'Syne, sans-serif', fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Lista de leads ── */}
        {leads.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <p className="section-label">{leads.length} lead{leads.length !== 1 ? 's' : ''} encontrado{leads.length !== 1 ? 's' : ''}</p>
              {leads.length > 3 && (
                <button
                  onClick={() => setExpanded(expanded.size > 0 ? new Set() : new Set(leads.map(l => l.cnpj)))}
                  style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {expanded.size > 0 ? 'Recolher todos' : 'Expandir todos'}
                </button>
              )}
            </div>
            {leads.map(lead => (
              <LeadCard
                key={lead.cnpj}
                lead={lead}
                expanded={expanded.has(lead.cnpj)}
                onToggle={() => toggleExpanded(lead.cnpj)}
              />
            ))}
          </div>
        )}

        {/* ── Estado vazio ── */}
        {!running && leads.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <p style={{ fontSize: 14 }}>Configure os filtros e clique em <strong style={{ color: 'var(--cream)' }}>Descobrir Leads</strong> para iniciar o pipeline.</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Os resultados aparecem em tempo real conforme são descobertos e enriquecidos.</p>
          </div>
        )}
      </main>
    </div>
  )
}
