'use client'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import UploadZone from '@/components/bulk/UploadZone'
import CampaignConfigPanel from '@/components/bulk/CampaignConfig'
import LeadsTable from '@/components/bulk/LeadsTable'
import LeadForm from '@/components/manual/LeadForm'
import { Lead, CampaignConfig } from '@/types'
import { parseCSV, detectColumnMapping, mapRowsToLeads, exportLeadsToCSV } from '@/lib/csvParser'

type Tab = 'bulk' | 'manual'

const defaultConfig: CampaignConfig = {
  metodologia: 'CLASSICA',
  tom: 'Semiformal',
  canal: 'LinkedIn',
  limite_caracteres: 300,
  ia: 'gemini',
}

function GeradorContent() {
  const params = useSearchParams()
  const router = useRouter()
  const tab    = (params.get('tab') as Tab) ?? 'manual'
  const setTab = (t: Tab) => router.push(`/gerador?tab=${t}`)

  const [config, setConfig]           = useState<CampaignConfig>(defaultConfig)
  const [leads, setLeads]             = useState<Lead[]>([])
  const [originalRows, setOriginalRows] = useState<Record<string, string>[]>([])
  const [step, setStep]               = useState<'upload' | 'config' | 'results'>('upload')
  const [generating, setGenerating]   = useState(false)
  const [sending, setSending]         = useState(false)
  const [progress, setProgress]       = useState({ current: 0, total: 0 })

  const handleFile = async (file: File) => {
    const { headers: h, rows } = await parseCSV(file)
    const m = detectColumnMapping(h)
    if (!m.nome || !m.empresa) {
      alert('CSV precisa ter pelo menos as colunas de nome e empresa.')
      return
    }
    setOriginalRows(rows)
    setLeads(mapRowsToLeads(rows.slice(0, 500), m))
    setStep('config')
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setProgress({ current: 0, total: leads.length })
    setStep('results')
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i]
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'generating' } : l))
      try {
        const res  = await fetch('/api/generate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ type: 'bulk', config, lead }),
        })
        const data = await res.json()
        setLeads(prev => prev.map(l =>
          l.id === lead.id ? { ...l, status: data.mensagem ? 'done' : 'error', mensagem_gerada: data.mensagem || '' } : l
        ))
      } catch {
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'error' } : l))
      }
      setProgress({ current: i + 1, total: leads.length })
      if (i < leads.length - 1) await new Promise(r => setTimeout(r, 300))
    }
    setGenerating(false)
  }

  const handleRegenerate = async (lead: Lead) => {
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'generating' } : l))
    try {
      const res  = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: lead.mensagem_gerada ? 'regenerate' : 'bulk', config, lead, mensagemAnterior: lead.mensagem_gerada }),
      })
      const data = await res.json()
      setLeads(prev => prev.map(l =>
        l.id === lead.id ? { ...l, status: data.mensagem ? 'done' : 'error', mensagem_gerada: data.mensagem || l.mensagem_gerada } : l
      ))
    } catch {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'error' } : l))
    }
  }

  const handleSendEmails = async () => {
    const leadsComEmail = leads.filter(l => l.status === 'done' && l.email && l.mensagem_gerada)
    if (leadsComEmail.length === 0) { alert('Nenhum lead com e-mail e mensagem gerada.'); return }
    if (!confirm(`Disparar e-mails para ${leadsComEmail.length} leads?`)) return
    setSending(true)
    setLeads(prev => prev.map(l => l.status === 'done' && l.email ? { ...l, envio: 'sending' } : l))
    try {
      const res  = await fetch('/api/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leads: leadsComEmail }),
      })
      const data = await res.json()
      const resultMap = new Map(data.results.map((r: { id: string; status: string }) => [r.id, r.status]))
      setLeads(prev => prev.map(l => ({ ...l, envio: resultMap.has(l.id) ? (resultMap.get(l.id) as 'sent' | 'error') : l.envio })))
    } catch {
      alert('Erro no disparo. Tente novamente.')
      setLeads(prev => prev.map(l => ({ ...l, envio: l.envio === 'sending' ? 'error' : l.envio })))
    } finally {
      setSending(false)
    }
  }

  const done          = leads.filter(l => l.status === 'done').length
  const sent          = leads.filter(l => l.envio === 'sent').length
  const leadsComEmail = leads.filter(l => l.status === 'done' && l.email).length
  const pct           = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Tab switcher ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 32, background: 'var(--bg-card)', padding: 4, borderRadius: 10, border: '1px solid var(--border)', width: 'fit-content' }}>
          {([['manual', '✦ Lead Manual'], ['bulk', '⚡ Em Massa']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background:   tab === t ? 'var(--green-primary)' : 'transparent',
                color:        tab === t ? 'var(--cream)' : 'var(--text-muted)',
                border:       'none',
                borderRadius: 7,
                padding:      '9px 22px',
                fontFamily:   'Syne, sans-serif',
                fontWeight:   700,
                fontSize:     '0.875rem',
                cursor:       'pointer',
                transition:   'all 0.2s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Lead Manual ── */}
        {tab === 'manual' && (
          <div className="fade-in">
            <LeadForm />
          </div>
        )}

        {/* ── Em Massa ── */}
        {tab === 'bulk' && (
          <div className="fade-in">
            {step === 'upload' && (
              <div>
                <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.6rem', marginBottom: 6 }}>
                  Prospecção em <span style={{ color: 'var(--gold)' }}>Escala</span>
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>
                  Suba o CSV do Apollo ou LeadHunter e gere mensagens personalizadas para cada lead.
                </p>
                <UploadZone onFile={handleFile} />
              </div>
            )}

            {step === 'config' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.4rem' }}>
                      <span style={{ color: 'var(--gold)' }}>{leads.length}</span> leads carregados
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Configure a campanha antes de gerar</p>
                  </div>
                  <button
                    onClick={() => { setStep('upload'); setLeads([]); setOriginalRows([]) }}
                    className="btn-secondary"
                  >
                    ← Novo CSV
                  </button>
                </div>
                <CampaignConfigPanel config={config} onChange={setConfig} />
                <button onClick={handleGenerate} className="btn-primary" style={{ padding: '15px', fontSize: '1rem', borderRadius: 10 }}>
                  ⚡ Gerar {leads.length} mensagens
                </button>
              </div>
            )}

            {step === 'results' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.4rem' }}>
                      {generating
                        ? <><span style={{ color: 'var(--gold)' }}>{progress.current}</span>/{progress.total} gerados</>
                        : <><span style={{ color: 'var(--gold)' }}>{done}</span> prontas {sent > 0 && <span style={{ color: 'var(--green)', fontSize: '1rem' }}>· {sent} enviados</span>}</>}
                    </h1>
                    {generating && (
                      <div style={{ marginTop: 8, background: 'var(--bg-card)', borderRadius: 100, height: 4, width: 200 }}>
                        <div style={{ background: 'var(--green-primary)', height: '100%', borderRadius: 100, width: `${pct}%`, transition: 'width 0.3s ease' }} />
                      </div>
                    )}
                  </div>
                  {!generating && done > 0 && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {leadsComEmail > 0 && (
                        <button onClick={handleSendEmails} disabled={sending} className="btn-secondary" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
                          {sending ? <><span className="spinner" /> Enviando...</> : `✉ Disparar E-mails (${leadsComEmail})`}
                        </button>
                      )}
                      <button onClick={() => exportLeadsToCSV(leads, originalRows)} className="btn-primary">
                        ↓ Exportar CSV
                      </button>
                    </div>
                  )}
                </div>
                <LeadsTable
                  leads={leads}
                  charLimit={config.limite_caracteres}
                  onRegenerate={handleRegenerate}
                  onAvaliar={(id, av) => setLeads(prev => prev.map(l => l.id === id ? { ...l, avaliacao: av } : l))}
                  onEditMensagem={(id, msg) => setLeads(prev => prev.map(l => l.id === id ? { ...l, mensagem_gerada: msg } : l))}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default function GeradorPage() {
  return (
    <Suspense fallback={null}>
      <GeradorContent />
    </Suspense>
  )
}
