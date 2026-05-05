'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type AgentState = 'idle' | 'loading_companies' | 'scraping' | 'paused' | 'done' | 'error'

interface ProcessedLead {
  nome:               string
  cnpj:               string
  setor:              string
  porte:              string
  cidade:             string
  email:              string | null
  telefone:           string | null
  linkedin_url:       string | null
  followers:          string | null
  potencial:          string | null
  justificativa:      string | null
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  argumento_abertura: string | null
  emails:             string[]
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

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  async function handleStart() {
    if (!extId || extStatus !== 'connected') return

    setLeads([])
    setProgress({ done: 0, total: 0 })
    setErrorMsg(null)
    setPauseReason(null)
    setExpandedIdx(null)
    setAgentState('loading_companies')

    const params = new URLSearchParams()
    params.set('setor', setor)
    params.set('limite', String(limite))
    regioes.forEach(r => params.append('regioes', r))
    portes.forEach(p => params.append('portes', p))

    const compRes  = await fetch(`/api/agent/companies?${params.toString()}`)
    const compData = await compRes.json()

    if (!compData.ok || !compData.companies?.length) {
      setErrorMsg(compData.error ?? 'Nenhuma empresa encontrada com esses filtros.')
      setAgentState('error')
      return
    }

    const queueRes = await sendToExt({ type: 'AGENT_SCRAPE_QUEUE', companies: compData.companies })

    if (!queueRes?.ok) {
      setErrorMsg('Erro ao enviar fila para a extensão. Verifique se ela está ativa.')
      setAgentState('error')
      return
    }

    setProgress({ done: 0, total: compData.companies.length })
    setAgentState('scraping')
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

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  if (status === 'loading') return null

  const canStart = !!setor && regioes.length > 0 && extStatus === 'connected'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>

      {/* Título */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0 }}>
          ✦ Agente Autônomo
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
          Descobre empresas via Brasil.io e enriquece com LinkedIn automaticamente.
          Requer a extensão ProspectAI instalada e login no LinkedIn.
        </p>
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

      {/* Filtros */}
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

          {/* Regiões */}
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

        {/* Botões de controle */}
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

          {agentState === 'loading_companies' && (
            <button className="btn-primary" disabled style={{ opacity: 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              Buscando empresas…
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

          {leads.length > 0 && agentState !== 'scraping' && agentState !== 'loading_companies' && (
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
      </div>

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

      {/* Mensagem de erro */}
      {agentState === 'error' && errorMsg && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.07)', padding: '12px 16px' }}>
          <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>⚠ {errorMsg}</p>
        </div>
      )}

      {/* Lista de leads */}
      {leads.length > 0 && (
        <div>
          <p className="section-label" style={{ marginBottom: 12 }}>
            {leads.length} empresa{leads.length !== 1 ? 's' : ''} processada{leads.length !== 1 ? 's' : ''}
          </p>

          {leads.map((lead, idx) => (
            <div
              key={`${lead.cnpj}-${idx}`}
              className="card fade-in"
              style={{ marginBottom: 10, cursor: 'pointer', padding: '14px 18px' }}
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            >
              {/* Header do card */}
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
                      }}>
                        sem LinkedIn
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    {lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}{lead.porte ? ` · ${lead.porte}` : ''}
                    {lead.followers ? ` · ${lead.followers}` : ''}
                  </div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                  {expandedIdx === idx ? '▲' : '▼'}
                </span>
              </div>

              {/* Detalhes */}
              {expandedIdx === idx && (
                <div
                  style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                    {/* Contato */}
                    <div>
                      <p className="section-label" style={{ marginBottom: 8 }}>Contato</p>
                      {lead.email && (
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>✉ {lead.email}</p>
                      )}
                      {lead.telefone && (
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>☎ {lead.telefone}</p>
                      )}
                      {lead.emails?.filter(e => e !== lead.email).map(e => (
                        <p key={e} style={{ fontSize: 12, color: '#4fa3e0', margin: '4px 0' }}>✉ {e}</p>
                      ))}
                      {lead.linkedin_url && (
                        <a
                          href={lead.linkedin_url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}
                        >
                          LinkedIn ↗
                        </a>
                      )}
                      {!lead.email && !lead.telefone && !(lead.emails?.length) && !lead.linkedin_url && (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem dados de contato</p>
                      )}
                    </div>

                    {/* Análise IA */}
                    <div>
                      {lead.justificativa && (
                        <>
                          <p className="section-label" style={{ marginBottom: 6 }}>Análise IA</p>
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                            {lead.justificativa}
                          </p>
                        </>
                      )}
                      {lead.argumento_abertura && (
                        <>
                          <p className="section-label" style={{ marginBottom: 6, marginTop: 12 }}>Argumento de abertura</p>
                          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>
                            &ldquo;{lead.argumento_abertura}&rdquo;
                          </p>
                        </>
                      )}
                    </div>

                    {/* Dores */}
                    {(lead.dores_tipicas?.length ?? 0) > 0 && (
                      <div>
                        <p className="section-label" style={{ marginBottom: 8 }}>Dores típicas</p>
                        {lead.dores_tipicas.map((d, i) => (
                          <p key={i} style={{ fontSize: 12, color: '#ef4444', margin: '3px 0' }}>! {d}</p>
                        ))}
                      </div>
                    )}

                    {/* Serviços */}
                    {(lead.servicos_sugeridos?.length ?? 0) > 0 && (
                      <div>
                        <p className="section-label" style={{ marginBottom: 8 }}>Serviços sugeridos</p>
                        {lead.servicos_sugeridos.map((s, i) => (
                          <p key={i} style={{ fontSize: 12, color: 'var(--green-primary)', margin: '3px 0' }}>✓ {s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Estado vazio */}
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
    </div>
  )
}
