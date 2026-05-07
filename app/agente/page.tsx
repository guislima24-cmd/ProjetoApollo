'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type AgentState = 'idle' | 'scraping' | 'paused' | 'done' | 'error'
type AgentMode  = 'linkedin' | 'apollo'

interface DecisionMaker {
  name:        string
  role:        string
  profile_url: string | null
}

interface ProcessedLead {
  nome:               string
  cnpj:               string | null
  setor:              string
  porte:              string | null
  cidade:             string
  email:              string | null
  telefone:           string | null
  linkedin_url:       string | null
  employees_count:    string | null
  decision_makers:    DecisionMaker[]
  potencial:          string | null
  justificativa:      string | null
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  argumento_abertura: string | null
  emails:             string[]
  ok:                 boolean
}

interface ApolloLead {
  nome:               string
  setor:              string
  porte:              string | null
  cidade:             string | null
  funcionarios:       string | null
  website:            string | null
  apollo_url:         string | null
  linkedin_url:       string | null
  email:              string | null
  telefone:           string | null
  cnpj:               string | null
  potencial:          string | null
  justificativa:      string | null
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  argumento_abertura: string | null
  score_fit:          number | null
  emails:             string[]
  decision_makers:    DecisionMaker[]
  ok:                 boolean
}

const SECTORS = [
  'TI', 'Tecnologia', 'Construção Civil', 'Educação', 'Saúde',
  'Varejo', 'Logística', 'Indústria', 'Alimentação', 'Consultoria',
  'Marketing', 'Financeiro', 'Imobiliário', 'Jurídico', 'Contabilidade',
]

const REGIONS = [
  'São Paulo', 'São Bernardo do Campo', 'Santo André', 'São Caetano do Sul',
  'Diadema', 'Mauá', 'Ribeirão Pires', 'Rio Grande da Serra',
  'Guarulhos', 'Campinas', 'Barueri', 'Osasco',
]

const PORTES = ['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE']

function potencialColor(p: string | null) {
  if (p === 'Alto')  return '#22c55e'
  if (p === 'Médio') return '#f59e0b'
  if (p === 'Baixo') return '#ef4444'
  return '#888'
}

export default function AgentePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [mode, setMode] = useState<AgentMode>('linkedin')

  const [extId,       setExtId]       = useState('')
  const [extStatus,   setExtStatus]   = useState<'unknown' | 'connected' | 'disconnected'>('unknown')

  const [setor,   setSetor]   = useState('')
  const [regioes, setRegioes] = useState<string[]>([])
  const [portes,  setPortes]  = useState<string[]>([])
  const [limite,  setLimite]  = useState(10)

  const [agentState,  setAgentState]  = useState<AgentState>('idle')
  const [leads,       setLeads]       = useState<ProcessedLead[]>([])
  const [progress,    setProgress]    = useState({ done: 0, total: 0 })
  const [pauseReason, setPauseReason] = useState<string | null>(null)
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const [localizacao, setLocalizacao] = useState('')

  // Apollo mode state
  const [apolloState,      setApolloState]      = useState<AgentState>('idle')
  const [apolloLeads,      setApolloLeads]      = useState<ApolloLead[]>([])
  const [apolloProgress,   setApolloProgress]   = useState({ done: 0, total: 0 })
  const [apolloPauseReason,setApolloPauseReason] = useState<string | null>(null)
  const [apolloErrorMsg,   setApolloErrorMsg]   = useState<string | null>(null)
  const [apolloExpandedIdx,setApolloExpandedIdx] = useState<number | null>(null)

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const apolloPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('agent_ext_id') ?? ''
    const envId = process.env.NEXT_PUBLIC_EXTENSION_ID ?? ''
    setExtId(saved || envId)
  }, [])

  async function pingExtension(id: string) {
    const cr = (window as any).chrome?.runtime
    if (!id || !cr) { setExtStatus('disconnected'); return }
    try {
      const result = await new Promise<{ ok?: boolean } | null>(resolve => {
        cr.sendMessage(id, { type: 'AGENT_PING' }, (res: any) => {
          if (cr.lastError) resolve(null)
          else resolve(res)
        })
      })
      setExtStatus(result?.ok ? 'connected' : 'disconnected')
    } catch {
      setExtStatus('disconnected')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (extId) pingExtension(extId) }, [extId])

  function sendToExt(message: object): Promise<any> {
    const cr = (window as any).chrome?.runtime
    return new Promise(resolve => {
      cr.sendMessage(extId, message, (res: any) => {
        if (cr.lastError) resolve(null)
        else resolve(res)
      })
    })
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const res = await sendToExt({ type: 'AGENT_GET_RESULTS' })
      if (!res?.ok) return

      setProgress(res.progress ?? { done: 0, total: 0 })
      setPauseReason(res.pauseReason ?? null)

      if (res.results?.length) {
        setLeads(prev => [...prev, ...res.results])
      }

      if (res.state === 'done' || res.state === 'error' || res.state === 'paused') {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setAgentState(
          res.state === 'paused' ? 'paused' :
          res.state === 'done'   ? 'done'   : 'error'
        )
        if (res.errorMessage) setErrorMsg(res.errorMessage)
      }
    }, 2000)
  }

  function startApolloPolling() {
    if (apolloPollRef.current) clearInterval(apolloPollRef.current)
    apolloPollRef.current = setInterval(async () => {
      const res = await sendToExt({ type: 'APOLLO_GET_RESULTS' })
      if (!res?.ok) return

      setApolloProgress(res.progress ?? { done: 0, total: 0 })
      setApolloPauseReason(res.pauseReason ?? null)

      if (res.results?.length) {
        setApolloLeads(prev => [...prev, ...res.results])
      }

      if (res.state === 'done' || res.state === 'error' || res.state === 'paused') {
        clearInterval(apolloPollRef.current!)
        apolloPollRef.current = null
        setApolloState(
          res.state === 'paused' ? 'paused' :
          res.state === 'done'   ? 'done'   : 'error'
        )
        if (res.errorMessage) setApolloErrorMsg(res.errorMessage)
      }
    }, 2000)
  }

  async function handleStart() {
    if (!extId || extStatus !== 'connected') return

    setLeads([])
    setProgress({ done: 0, total: 0 })
    setErrorMsg(null)
    setPauseReason(null)
    setExpandedIdx(null)
    setAgentState('scraping')

    const queueRes = await sendToExt({
      type: 'AGENT_SCRAPE_QUEUE',
      searchParams: { setor, regioes, limite, portes },
    })

    if (!queueRes?.ok) {
      setErrorMsg(queueRes?.error ?? 'Erro ao iniciar o agente. Verifique se a extensão está ativa.')
      setAgentState('error')
      return
    }

    setProgress({ done: 0, total: queueRes.target ?? limite })
    startPolling()
  }

  async function handlePause() {
    await sendToExt({ type: 'AGENT_PAUSE' })
    setAgentState('paused')
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleResume() {
    await sendToExt({ type: 'AGENT_RESUME' })
    setAgentState('scraping')
    startPolling()
  }

  async function handleClear() {
    await sendToExt({ type: 'AGENT_CLEAR' })
    setLeads([])
    setProgress({ done: 0, total: 0 })
    setAgentState('idle')
    setErrorMsg(null)
    setPauseReason(null)
    setExpandedIdx(null)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleApolloStart() {
    if (!extId || extStatus !== 'connected') return

    setApolloLeads([])
    setApolloProgress({ done: 0, total: 0 })
    setApolloErrorMsg(null)
    setApolloPauseReason(null)
    setApolloExpandedIdx(null)
    setApolloState('scraping')

    const queueRes = await sendToExt({
      type: 'APOLLO_SCRAPE_QUEUE',
      searchParams: { setor, portes, limite, localizacao: localizacao.trim() || null },
    })

    if (!queueRes?.ok) {
      setApolloErrorMsg(queueRes?.error ?? 'Erro ao iniciar o agente Apollo.')
      setApolloState('error')
      return
    }

    setApolloProgress({ done: 0, total: queueRes.target ?? limite })
    startApolloPolling()
  }

  async function handleApolloPause() {
    await sendToExt({ type: 'APOLLO_PAUSE' })
    setApolloState('paused')
    if (apolloPollRef.current) { clearInterval(apolloPollRef.current); apolloPollRef.current = null }
  }

  async function handleApolloResume() {
    await sendToExt({ type: 'APOLLO_RESUME' })
    setApolloState('scraping')
    startApolloPolling()
  }

  async function handleApolloClear() {
    await sendToExt({ type: 'APOLLO_CLEAR' })
    setApolloLeads([])
    setApolloProgress({ done: 0, total: 0 })
    setApolloState('idle')
    setApolloErrorMsg(null)
    setApolloPauseReason(null)
    setApolloExpandedIdx(null)
    if (apolloPollRef.current) { clearInterval(apolloPollRef.current); apolloPollRef.current = null }
  }

  useEffect(() => () => {
    if (pollRef.current)      clearInterval(pollRef.current)
    if (apolloPollRef.current) clearInterval(apolloPollRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === 'loading') return null

  const canStart       = !!setor && regioes.length > 0 && extStatus === 'connected'
  const canApolloStart = !!setor && extStatus === 'connected'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>

      {/* Título */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0 }}>
          ✦ Agente Autônomo
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
          Descobre empresas por setor automaticamente e enriquece com CNPJ, email e análise IA.
          Requer a extensão ProspectAI instalada.
        </p>
      </div>

      {/* Seletor de modo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['linkedin', 'apollo'] as AgentMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${mode === m ? 'var(--green-primary)' : 'var(--border)'}`,
              background: mode === m ? 'rgba(49,112,57,0.18)' : 'transparent',
              color: mode === m ? 'var(--green-primary)' : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {m === 'linkedin' ? '🔗 LinkedIn' : '🚀 Apollo.io'}
          </button>
        ))}
      </div>

      {/* Conexão com extensão */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <p className="section-label" style={{ marginBottom: 10 }}>Extensão Chrome</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input"
            value={extId}
            onChange={e => {
              setExtId(e.target.value)
              localStorage.setItem('agent_ext_id', e.target.value)
            }}
            placeholder="ID da extensão (ex: abcdefghijklmnop…)"
            style={{ flex: 1, minWidth: 220, fontSize: 12, fontFamily: 'monospace' }}
          />
          <button
            className="btn-secondary"
            onClick={() => pingExtension(extId)}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            Testar
          </button>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: extStatus === 'connected'    ? 'var(--green-primary)' :
                   extStatus === 'disconnected' ? '#ef4444' : 'var(--text-muted)',
          }}>
            {extStatus === 'connected'    ? '● Conectado'    :
             extStatus === 'disconnected' ? '● Desconectado' : '●'}
          </span>
        </div>
        {extStatus === 'disconnected' && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
            Instale a extensão ProspectAI, vá em <strong>chrome://extensions</strong>,
            ative o Modo Desenvolvedor, copie o ID e cole acima.
          </p>
        )}
      </div>

      {/* Filtros (compartilhados entre modos) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

          {/* Setor */}
          <div>
            <label className="section-label">Setor *</label>
            <select
              className="input"
              value={setor}
              onChange={e => setSetor(e.target.value)}
              style={{ width: '100%', marginTop: 8 }}
            >
              <option value="">Selecione…</option>
              {SECTORS.map(s => (
                <option key={s} value={s.toLowerCase()}>{s}</option>
              ))}
            </select>
          </div>

          {/* Limite */}
          <div>
            <label className="section-label">Limite: {limite} empresas</label>
            <input
              type="range" min={5} max={20} step={5}
              value={limite}
              onChange={e => setLimite(Number(e.target.value))}
              style={{ width: '100%', marginTop: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>5</span><span>10</span><span>15</span><span>20</span>
            </div>
          </div>

          {/* Regiões — só no modo LinkedIn */}
          {mode === 'linkedin' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="section-label">Regiões *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {REGIONS.map(r => {
                  const active = regioes.includes(r)
                  return (
                    <button
                      key={r}
                      onClick={() => setRegioes(p => active ? p.filter(x => x !== r) : [...p, r])}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12,
                        border: `1px solid ${active ? 'var(--green-primary)' : 'var(--border)'}`,
                        background: active ? 'rgba(49,112,57,0.15)' : 'transparent',
                        color: active ? 'var(--green-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                      }}
                    >
                      {r}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Apollo: filtro de localização */}
          {mode === 'apollo' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="section-label">Localização (opcional)</label>
              <input
                className="input"
                value={localizacao}
                onChange={e => setLocalizacao(e.target.value)}
                placeholder="Ex: São Paulo, Rio de Janeiro, Curitiba…"
                style={{ width: '100%', marginTop: 8, fontSize: 13 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {['São Paulo', 'Rio de Janeiro', 'Curitiba', 'Belo Horizonte', 'Porto Alegre', 'Campinas', 'Brasília', 'Brasil'].map(c => (
                  <button
                    key={c}
                    onClick={() => setLocalizacao(localizacao === c ? '' : c)}
                    style={{
                      padding: '4px 10px', borderRadius: 16, fontSize: 11,
                      border: `1px solid ${localizacao === c ? '#818cf8' : 'var(--border)'}`,
                      background: localizacao === c ? 'rgba(99,102,241,0.15)' : 'transparent',
                      color: localizacao === c ? '#818cf8' : 'var(--text-muted)',
                      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Portes */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="section-label">Porte (opcional — vazio = todos)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {PORTES.map(p => {
                const active = portes.includes(p)
                return (
                  <button
                    key={p}
                    onClick={() => setPortes(prev => active ? prev.filter(x => x !== p) : [...prev, p])}
                    style={{
                      padding: '5px 14px', borderRadius: 20, fontSize: 12,
                      border: `1px solid ${active ? 'var(--green-primary)' : 'var(--border)'}`,
                      background: active ? 'rgba(49,112,57,0.15)' : 'transparent',
                      color: active ? 'var(--green-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Botões de controle — LinkedIn */}
        {mode === 'linkedin' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' }}>
            {(agentState === 'idle' || agentState === 'done' || agentState === 'error') && (
              <button
                className="btn-primary"
                onClick={handleStart}
                disabled={!canStart}
                style={{ opacity: canStart ? 1 : 0.4 }}
              >
                {agentState === 'idle' ? '▶ Iniciar Agente' : '▶ Nova Busca'}
              </button>
            )}

            {agentState === 'scraping' && (
              <button className="btn-secondary" onClick={handlePause}>⏸ Pausar</button>
            )}

            {agentState === 'paused' && (
              <>
                <button className="btn-primary" onClick={handleResume}>▶ Retomar</button>
                <span style={{ fontSize: 12, color: '#f59e0b' }}>
                  {pauseReason === 'login'   ? '⚠ Faça login no LinkedIn e retome' :
                   pauseReason === 'captcha' ? '⚠ Resolva o captcha no LinkedIn e retome' :
                   '⏸ Pausado'}
                </span>
              </>
            )}

            {leads.length > 0 && agentState !== 'scraping' && (
              <button
                onClick={handleClear}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 7,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans',
                }}
              >
                🗑 Limpar
              </button>
            )}
          </div>
        )}

        {/* Botões de controle — Apollo */}
        {mode === 'apollo' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' }}>
            {(apolloState === 'idle' || apolloState === 'done' || apolloState === 'error') && (
              <button
                className="btn-primary"
                onClick={handleApolloStart}
                disabled={!canApolloStart}
                style={{ opacity: canApolloStart ? 1 : 0.4 }}
              >
                {apolloState === 'idle' ? '🚀 Iniciar Apollo' : '🚀 Nova Busca'}
              </button>
            )}

            {apolloState === 'scraping' && (
              <button className="btn-secondary" onClick={handleApolloPause}>⏸ Pausar</button>
            )}

            {apolloState === 'paused' && (
              <>
                <button className="btn-primary" onClick={handleApolloResume}>▶ Retomar</button>
                <span style={{ fontSize: 12, color: '#f59e0b' }}>
                  {apolloPauseReason === 'login' ? '⚠ Faça login no Apollo.io e retome' : '⏸ Pausado'}
                </span>
              </>
            )}

            {apolloLeads.length > 0 && apolloState !== 'scraping' && (
              <button
                onClick={handleApolloClear}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 7,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans',
                }}
              >
                🗑 Limpar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── MODO LINKEDIN ─────────────────────────────────────────── */}
      {mode === 'linkedin' && (
        <>
          {/* Barra de progresso */}
          {progress.total > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>
                  {agentState === 'scraping' && (
                    <><span className="spinner" style={{ display: 'inline-block', width: 11, height: 11, marginRight: 6 }} />Processando…</>
                  )}
                  {agentState === 'paused' && '⏸ Pausado'}
                  {agentState === 'done'   && '✓ Concluído'}
                </span>
                <span style={{ fontWeight: 600 }}>{progress.done} / {progress.total}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: agentState === 'paused' ? '#f59e0b' : 'var(--green-primary)',
                  width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )}

          {agentState === 'error' && errorMsg && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.07)', padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>⚠ {errorMsg}</p>
            </div>
          )}

          {leads.length > 0 && (
            <div>
              <p className="section-label" style={{ marginBottom: 12 }}>
                {leads.length} empresa{leads.length !== 1 ? 's' : ''} processada{leads.length !== 1 ? 's' : ''}
              </p>

              {leads.map((lead, idx) => (
                <div
                  key={`${lead.linkedin_url ?? lead.nome}-${idx}`}
                  className="card fade-in"
                  style={{ marginBottom: 10, cursor: 'pointer', padding: '14px 18px' }}
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 14 }}>{lead.nome}</span>
                        {lead.potencial && (
                          <span className="badge" style={{
                            background: potencialColor(lead.potencial) + '22',
                            color:      potencialColor(lead.potencial),
                            border:     `1px solid ${potencialColor(lead.potencial)}44`,
                            fontSize: 11,
                          }}>
                            {lead.potencial}
                          </span>
                        )}
                        {!lead.ok && (
                          <span className="badge" style={{
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.2)', fontSize: 11,
                          }}>sem LinkedIn</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}{lead.porte ? ` · ${lead.porte}` : ''}
                        {lead.employees_count ? ` · ${lead.employees_count}` : ''}
                        {lead.decision_makers?.length ? ` · ${lead.decision_makers.length} decisor${lead.decision_makers.length !== 1 ? 'es' : ''}` : ''}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                      {expandedIdx === idx ? '▲' : '▼'}
                    </span>
                  </div>

                  {expandedIdx === idx && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <p className="section-label" style={{ marginBottom: 8 }}>Contato</p>
                          {lead.email    && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>✉ {lead.email}</p>}
                          {lead.telefone && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>☎ {lead.telefone}</p>}
                          {lead.emails?.filter(e => e !== lead.email).map(e => (
                            <p key={e} style={{ fontSize: 12, color: '#4fa3e0', margin: '4px 0' }}>✉ {e}</p>
                          ))}
                          {lead.linkedin_url && (
                            <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>LinkedIn ↗</a>
                          )}
                          {!lead.email && !lead.telefone && !(lead.emails?.length) && !lead.linkedin_url && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem dados de contato</p>
                          )}
                        </div>
                        <div>
                          {lead.justificativa && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6 }}>Análise IA</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{lead.justificativa}</p>
                            </>
                          )}
                          {lead.argumento_abertura && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6, marginTop: 12 }}>Argumento de abertura</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>&ldquo;{lead.argumento_abertura}&rdquo;</p>
                            </>
                          )}
                        </div>
                        {(lead.decision_makers?.length ?? 0) > 0 && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <p className="section-label" style={{ marginBottom: 8 }}>Decisores</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {lead.decision_makers.map((dm, i) => (
                                <div key={i} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{dm.name}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>{dm.role}</span>
                                  {dm.profile_url && <a href={dm.profile_url} target="_blank" rel="noreferrer" style={{ color: '#4fa3e0', marginLeft: 'auto' }}>LinkedIn ↗</a>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(lead.dores_tipicas?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Dores típicas</p>
                            {lead.dores_tipicas.map((d, i) => <p key={i} style={{ fontSize: 12, color: '#ef4444', margin: '3px 0' }}>! {d}</p>)}
                          </div>
                        )}
                        {(lead.servicos_sugeridos?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Serviços sugeridos</p>
                            {lead.servicos_sugeridos.map((s, i) => <p key={i} style={{ fontSize: 12, color: 'var(--green-primary)', margin: '3px 0' }}>✓ {s}</p>)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {leads.length === 0 && (agentState === 'idle' || agentState === 'done') && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>🤖</p>
              <p style={{ fontSize: 14 }}>
                {agentState === 'idle'
                  ? 'Configure os filtros e inicie o agente para descobrir leads automaticamente.'
                  : 'Nenhum lead retornado. Tente ajustar os filtros.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── MODO APOLLO ───────────────────────────────────────────── */}
      {mode === 'apollo' && (
        <>
          {apolloProgress.total > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>
                  {apolloState === 'scraping' && (
                    <><span className="spinner" style={{ display: 'inline-block', width: 11, height: 11, marginRight: 6 }} />Buscando no Apollo…</>
                  )}
                  {apolloState === 'paused' && '⏸ Pausado'}
                  {apolloState === 'done'   && '✓ Concluído'}
                </span>
                <span style={{ fontWeight: 600 }}>{apolloProgress.done} / {apolloProgress.total}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: apolloState === 'paused' ? '#f59e0b' : '#6366f1',
                  width: `${Math.round((apolloProgress.done / apolloProgress.total) * 100)}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )}

          {apolloState === 'error' && apolloErrorMsg && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.07)', padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>⚠ {apolloErrorMsg}</p>
            </div>
          )}

          {apolloLeads.length > 0 && (
            <div>
              <p className="section-label" style={{ marginBottom: 12 }}>
                {apolloLeads.length} empresa{apolloLeads.length !== 1 ? 's' : ''} encontrada{apolloLeads.length !== 1 ? 's' : ''} via Apollo
              </p>

              {apolloLeads.map((lead, idx) => (
                <div
                  key={`${lead.apollo_url ?? lead.nome}-${idx}`}
                  className="card fade-in"
                  style={{ marginBottom: 10, cursor: 'pointer', padding: '14px 18px' }}
                  onClick={() => setApolloExpandedIdx(apolloExpandedIdx === idx ? null : idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 14 }}>{lead.nome}</span>
                        {lead.potencial && (
                          <span className="badge" style={{
                            background: potencialColor(lead.potencial) + '22',
                            color:      potencialColor(lead.potencial),
                            border:     `1px solid ${potencialColor(lead.potencial)}44`,
                            fontSize: 11,
                          }}>
                            {lead.potencial}
                          </span>
                        )}
                        {lead.score_fit != null && (
                          <span className="badge" style={{
                            background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                            border: '1px solid rgba(99,102,241,0.3)', fontSize: 11,
                          }}>
                            Fit {lead.score_fit}/10
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}{lead.porte ? ` · ${lead.porte}` : ''}
                        {lead.funcionarios ? ` · ${lead.funcionarios} func.` : ''}
                        {lead.website ? ` · ${lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                      {apolloExpandedIdx === idx ? '▲' : '▼'}
                    </span>
                  </div>

                  {apolloExpandedIdx === idx && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <p className="section-label" style={{ marginBottom: 8 }}>Contato</p>
                          {lead.email    && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>✉ {lead.email}</p>}
                          {lead.telefone && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>☎ {lead.telefone}</p>}
                          {lead.emails?.filter(e => e !== lead.email).map(e => (
                            <p key={e} style={{ fontSize: 12, color: '#4fa3e0', margin: '4px 0' }}>✉ {e}</p>
                          ))}
                          {lead.website && (
                            <a href={lead.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>Site ↗</a>
                          )}
                          {lead.linkedin_url && (
                            <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>LinkedIn ↗</a>
                          )}
                          {lead.apollo_url && (
                            <a href={lead.apollo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#818cf8', display: 'block', marginTop: 4 }}>Apollo ↗</a>
                          )}
                          {!lead.email && !lead.telefone && !(lead.emails?.length) && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem dados de contato</p>
                          )}
                        </div>
                        <div>
                          {lead.justificativa && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6 }}>Análise IA</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{lead.justificativa}</p>
                            </>
                          )}
                          {lead.argumento_abertura && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6, marginTop: 12 }}>Argumento de abertura</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>&ldquo;{lead.argumento_abertura}&rdquo;</p>
                            </>
                          )}
                        </div>
                        {(lead.dores_tipicas?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Dores típicas</p>
                            {lead.dores_tipicas.map((d, i) => <p key={i} style={{ fontSize: 12, color: '#ef4444', margin: '3px 0' }}>! {d}</p>)}
                          </div>
                        )}
                        {(lead.servicos_sugeridos?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Serviços sugeridos</p>
                            {lead.servicos_sugeridos.map((s, i) => <p key={i} style={{ fontSize: 12, color: 'var(--green-primary)', margin: '3px 0' }}>✓ {s}</p>)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {apolloLeads.length === 0 && (apolloState === 'idle' || apolloState === 'done') && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>🚀</p>
              <p style={{ fontSize: 14 }}>
                {apolloState === 'idle'
                  ? 'Selecione o setor e inicie o agente Apollo para descobrir leads via Apollo.io.'
                  : 'Nenhum lead retornado. Certifique-se de estar logado no Apollo.io.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
