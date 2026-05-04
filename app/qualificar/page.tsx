'use client'

import { useState } from 'react'

type Bant = { budget: number; authority: number; need: number; timeline: number }
type Ice  = { impact: number; confidence: number; ease: number }

type QualifyResult = {
  scores: {
    bantTotal: number
    iceAvg: number
    scoreFinal: number
    classificacao: 'Hot' | 'Warm' | 'Cold'
  }
  analysis: {
    summary: string
    bant_comments: { budget: string; authority: string; need: string; timeline: string }
    strengths: string[]
    risks: string[]
    next_steps: string[]
    verdict: string
  }
}

const BANT_CRITERIA = [
  { key: 'budget' as const,    label: 'Budget',    desc: 'Tem orçamento disponível?' },
  { key: 'authority' as const, label: 'Authority', desc: 'Tem poder de decisão?' },
  { key: 'need' as const,      label: 'Need',      desc: 'Tem necessidade/dor clara?' },
  { key: 'timeline' as const,  label: 'Timeline',  desc: 'Tem urgência ou prazo?' },
]

const ICE_CRITERIA = [
  { key: 'impact' as const,     label: 'Impact',     desc: 'Impacto potencial do cliente' },
  { key: 'confidence' as const, label: 'Confidence', desc: 'Confiança na conversão' },
  { key: 'ease' as const,       label: 'Ease',       desc: 'Facilidade de abordagem' },
]

function classLabel(c: string) {
  if (c === 'Hot')  return { text: '🔥 Hot',  bg: 'rgba(239,68,68,0.12)',   color: '#f87171' }
  if (c === 'Warm') return { text: '♨ Warm', bg: 'rgba(241,190,73,0.15)',  color: 'var(--gold)' }
  return                   { text: '❄ Cold', bg: 'rgba(79,163,224,0.12)',  color: '#60a5fa' }
}

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 100, height: 6, width: '100%', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 100, transition: 'width 0.4s ease' }} />
    </div>
  )
}

export default function QualificarPage() {
  const [form, setForm] = useState({ empresa: '', setor: '', contato: '', cargo: '', contexto: '' })
  const [bant, setBant] = useState<Bant>({ budget: 1, authority: 1, need: 1, timeline: 1 })
  const [ice,  setIce]  = useState<Ice>({ impact: 5, confidence: 5, ease: 5 })
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState<string | null>(null)
  const [result,  setResult]    = useState<QualifyResult | null>(null)

  const setField = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  // Cálculo ao vivo
  const bantTotal  = bant.budget + bant.authority + bant.need + bant.timeline
  const iceAvg     = (ice.impact + ice.confidence + ice.ease) / 3
  const scoreFinal = Math.round((bantTotal / 8) * 50 + (iceAvg / 10) * 50)
  const classif    = scoreFinal >= 65 ? 'Hot' : scoreFinal >= 35 ? 'Warm' : 'Cold'
  const badge      = classLabel(classif)

  const handleSubmit = async () => {
    if (!form.empresa.trim() || !form.contato.trim()) {
      setError('Empresa e Nome do contato são obrigatórios.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res  = await fetch('/api/qualify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bant, ice }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error ?? 'Erro ao qualificar. Tente novamente.')
      } else {
        setResult(data)
      }
    } catch {
      setError('Falha de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const resultBadge = result ? classLabel(result.scores.classificacao) : badge

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <main style={{ maxWidth: 1020, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.65rem', marginBottom: 6 }}>
            Qualificar <span style={{ color: 'var(--gold)' }}>Lead</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Avalie o potencial de um lead com BANT + ICE Score e análise por IA.
          </p>
        </div>

        {/* ── Grid principal ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

          {/* ── COLUNA ESQUERDA: Formulário ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Card: Dados do Lead */}
            <div className="card">
              <p className="section-label" style={{ marginBottom: 16 }}>Dados do Lead</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                    Empresa <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input className="input" value={form.empresa} onChange={setField('empresa')} placeholder="Ex: Acme Corp" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                    Setor
                  </label>
                  <input className="input" value={form.setor} onChange={setField('setor')} placeholder="Ex: Tecnologia" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                    Nome do contato <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input className="input" value={form.contato} onChange={setField('contato')} placeholder="Ex: João Silva" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                    Cargo
                  </label>
                  <input className="input" value={form.cargo} onChange={setField('cargo')} placeholder="Ex: Diretor Comercial" />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>
                  Contexto / Observações
                </label>
                <textarea
                  className="input"
                  value={form.contexto}
                  onChange={setField('contexto')}
                  placeholder="Informações relevantes sobre o lead, dores identificadas, histórico de contato..."
                  rows={3}
                  style={{ resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
            </div>

            {/* Card: BANT */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p className="section-label">BANT Score</p>
                <span style={{
                  background: 'rgba(49,112,57,0.15)', color: '#6ee87c',
                  fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700,
                  padding: '3px 10px', borderRadius: 100,
                }}>
                  {bantTotal}/8
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {BANT_CRITERIA.map(({ key, label, desc }) => (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>{label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {([{ val: 0, text: 'Não' }, { val: 1, text: 'Talvez' }, { val: 2, text: 'Sim' }] as const).map(({ val, text }) => {
                        const active = bant[key] === val
                        const activeColor = val === 0 ? 'var(--red)' : val === 1 ? 'var(--gold)' : '#6ee87c'
                        const activeBg   = val === 0 ? 'rgba(239,68,68,0.12)' : val === 1 ? 'rgba(241,190,73,0.12)' : 'rgba(49,112,57,0.18)'
                        return (
                          <button
                            key={val}
                            onClick={() => setBant(p => ({ ...p, [key]: val }))}
                            style={{
                              flex: 1, padding: '8px 0', cursor: 'pointer',
                              fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: 13,
                              borderRadius: 7, transition: 'all 0.15s',
                              background: active ? activeBg : 'var(--bg)',
                              border: `1px solid ${active ? activeColor : 'var(--border)'}`,
                              color: active ? activeColor : 'var(--text-muted)',
                            }}
                          >
                            {text}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card: ICE */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p className="section-label">ICE Score</p>
                <span style={{
                  background: 'rgba(241,190,73,0.12)', color: 'var(--gold)',
                  fontSize: 12, fontFamily: 'Syne, sans-serif', fontWeight: 700,
                  padding: '3px 10px', borderRadius: 100,
                }}>
                  {iceAvg.toFixed(1)}/10
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {ICE_CRITERIA.map(({ key, label, desc }) => (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13 }}>{label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{desc}</span>
                      </div>
                      <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--gold)', minWidth: 20, textAlign: 'right' }}>
                        {ice[key]}
                      </span>
                    </div>
                    <input
                      type="range" min={1} max={10} value={ice[key]}
                      onChange={e => setIce(p => ({ ...p, [key]: Number(e.target.value) }))}
                      style={{ width: '100%', accentColor: 'var(--green-primary)', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>1</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>10</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── COLUNA DIREITA: Score preview + Resultados ── */}
          <div style={{ position: 'sticky', top: 72, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Score preview (ao vivo) */}
            <div className="card">
              <p className="section-label" style={{ marginBottom: 14 }}>Score ao Vivo</p>

              {/* Score final */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 52, fontFamily: 'Syne, sans-serif', fontWeight: 800, lineHeight: 1, color: 'var(--cream)' }}>
                  {scoreFinal}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>/ 100</div>
                <span style={{
                  display: 'inline-block',
                  background: badge.bg, color: badge.color,
                  fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
                  padding: '5px 16px', borderRadius: 100,
                }}>
                  {badge.text}
                </span>
              </div>

              {/* Barras de score */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>BANT</span>
                    <span style={{ fontSize: 12, color: '#6ee87c', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{bantTotal}/8</span>
                  </div>
                  <ScoreBar value={bantTotal} max={8} color="var(--green-primary)" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'Syne, sans-serif', fontWeight: 600 }}>ICE</span>
                    <span style={{ fontSize: 12, color: 'var(--gold)', fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{iceAvg.toFixed(1)}/10</span>
                  </div>
                  <ScoreBar value={iceAvg} max={10} color="var(--gold)" />
                </div>
              </div>

              {/* Legenda de classificação */}
              <div style={{ display: 'flex', gap: 6, marginTop: 14, justifyContent: 'center' }}>
                {[{ text: '❄ Cold', range: '<35', bg: 'rgba(79,163,224,0.1)', color: '#60a5fa' },
                  { text: '♨ Warm', range: '35–64', bg: 'rgba(241,190,73,0.1)', color: 'var(--gold)' },
                  { text: '🔥 Hot', range: '≥65', bg: 'rgba(239,68,68,0.1)', color: '#f87171' }].map(item => (
                  <div key={item.text} style={{
                    flex: 1, textAlign: 'center', padding: '4px 4px', borderRadius: 6,
                    background: item.bg, border: `1px solid ${item.color}22`,
                  }}>
                    <div style={{ fontSize: 10, color: item.color, fontFamily: 'Syne, sans-serif', fontWeight: 700 }}>{item.text}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{item.range}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Botão qualificar */}
            {error && (
              <div style={{
                background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13,
              }}>
                ⚠ {error}
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary"
              style={{ padding: '14px', fontSize: '0.95rem', borderRadius: 10 }}
            >
              {loading
                ? <><span className="spinner" style={{ marginRight: 8 }} />Analisando com IA...</>
                : '✦ Qualificar Lead'}
            </button>

            {/* Resultados da IA */}
            {result && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Veredicto */}
                <div style={{
                  background: `${resultBadge.bg}`, border: `1px solid ${resultBadge.color}44`,
                  borderRadius: 12, padding: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      background: resultBadge.bg, color: resultBadge.color,
                      fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13,
                      padding: '4px 12px', borderRadius: 100,
                    }}>
                      {resultBadge.text}
                    </span>
                    <span style={{ fontSize: 15, fontFamily: 'Syne, sans-serif', fontWeight: 800, color: 'var(--cream)' }}>
                      {result.scores.scoreFinal}/100
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--cream)', lineHeight: 1.5, fontStyle: 'italic' }}>
                    "{result.analysis.verdict}"
                  </p>
                </div>

                {/* Resumo */}
                <div className="card" style={{ padding: 14 }}>
                  <p className="section-label" style={{ marginBottom: 8 }}>Análise Geral</p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {result.analysis.summary}
                  </p>
                </div>

                {/* BANT Comments */}
                <div className="card" style={{ padding: 14 }}>
                  <p className="section-label" style={{ marginBottom: 10 }}>Análise BANT</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {BANT_CRITERIA.map(({ key, label }) => (
                      <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{
                          fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11,
                          color: 'var(--text-muted)', minWidth: 66, paddingTop: 1,
                        }}>
                          {label}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {result.analysis.bant_comments[key]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths */}
                {result.analysis.strengths.length > 0 && (
                  <div className="card" style={{ padding: 14 }}>
                    <p className="section-label" style={{ marginBottom: 10, color: '#6ee87c' }}>Pontos Fortes</p>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {result.analysis.strengths.map((s, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                          <span style={{ color: '#6ee87c', marginTop: 1 }}>✓</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risks */}
                {result.analysis.risks.length > 0 && (
                  <div className="card" style={{ padding: 14 }}>
                    <p className="section-label" style={{ marginBottom: 10, color: '#f87171' }}>Riscos</p>
                    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {result.analysis.risks.map((r, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                          <span style={{ color: '#f87171', marginTop: 1 }}>!</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next Steps */}
                {result.analysis.next_steps.length > 0 && (
                  <div className="card" style={{ padding: 14 }}>
                    <p className="section-label" style={{ marginBottom: 10 }}>Próximos Passos</p>
                    <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {result.analysis.next_steps.map((step, i) => (
                        <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                          <span style={{
                            background: 'rgba(49,112,57,0.2)', color: 'var(--green-primary)',
                            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11,
                            minWidth: 20, height: 20, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginTop: 1, flexShrink: 0,
                          }}>
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Nova qualificação */}
                <button
                  onClick={() => { setResult(null); setError(null) }}
                  className="btn-secondary"
                  style={{ width: '100%' }}
                >
                  ← Qualificar outro lead
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
