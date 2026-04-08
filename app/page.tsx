'use client'
import { useState } from 'react'
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
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('bulk')
  const [config, setConfig] = useState<CampaignConfig>(defaultConfig)
  const [leads, setLeads] = useState<Lead[]>([])
  const [originalRows, setOriginalRows] = useState<Record<string, string>[]>([])
  const [step, setStep] = useState<'upload' | 'config' | 'results'>('upload')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

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
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'bulk', config, lead }),
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
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: lead.mensagem_gerada ? 'regenerate' : 'bulk', config, lead, mensagemAnterior: lead.mensagem_gerada }),
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
    if (leadsComEmail.length === 0) {
      alert('Nenhum lead com e-mail e mensagem gerada.')
      return
    }
    if (!confirm(`Disparar e-mails para ${leadsComEmail.length} leads?`)) return
    setSending(true)
    setLeads(prev => prev.map(l =>
      l.status === 'done' && l.email ? { ...l, envio: 'sending' } : l
    ))
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: leadsComEmail }),
      })
      const data = await res.json()
      const resultMap = new Map(data.results.map((r: { id: string; status: string }) => [r.id, r.status]))
      setLeads(prev => prev.map(l => ({
        ...l,
        envio: resultMap.has(l.id) ? (resultMap.get(l.id) as 'sent' | 'error') : l.envio,
      })))
    } catch {
      alert('Erro no disparo. Tente novamente.')
      setLeads(prev => prev.map(l => ({ ...l, envio: l.envio === 'sending' ? 'error' : l.envio })))
    } finally {
      setSending(false)
    }
  }

  const done = leads.filter(l => l.status === 'done').length
  const sent = leads.filter(l => l.envio === 'sent').length
  const leadsComEmail = leads.filter(l => l.status === 'done' && l.email).length
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ borderBottom: '1px solid var(--border)', padding: '0 32px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ background: 'var(--accent)', color: '#000', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '0.8rem', padding: '3px 8px', borderRadius: '4px' }}>PROSPECT</span>
          <span style={{ color: 'var(--accent)', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '0.8rem' }}>AI</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'Syne, sans-serif' }}>· UFABC Júnior</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          {([['bulk', '⚡ Bulk CSV'], ['manual', '✦ Lead Manual']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '6px', padding: '8px 20px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ width: '140px' }} />
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
        {tab === 'bulk' && (
          <div className="fade-in">
            {step === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.75rem' }}>Prospecção em <span style={{ color: 'var(--accent)' }}>Escala</span></h1>
                  <p style={{ color: 'var(--text-muted)', marginTop: '6px', fontSize: '0.9rem' }}>Suba o CSV do Apollo ou LeadHunter e gere mensagens personalizadas para cada lead.</p>
                </div>
                <UploadZone onFile={handleFile} />
              </div>
            )}

            {step === 'config' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.5rem' }}><span style={{ color: 'var(--accent)' }}>{leads.length}</span> leads carregados</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>Configure a campanha e clique em gerar</p>
                  </div>
                  <button onClick={() => { setStep('upload'); setLeads([]); setOriginalRows([]) }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>← Novo CSV</button>
                </div>
                <CampaignConfigPanel config={config} onChange={setConfig} />
                <button onClick={handleGenerate} style={{ width: '100%', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '10px', padding: '16px', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>
                  ⚡ Gerar {leads.length} Mensagens
                </button>
              </div>
            )}

            {step === 'results' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.5rem' }}>
                      {generating
                        ? <><span style={{ color: 'var(--accent)' }}>{progress.current}</span>/{progress.total} gerados</>
                        : <><span style={{ color: 'var(--accent)' }}>{done}</span> mensagens prontas {sent > 0 && <span style={{ color: 'var(--green)', fontSize: '1rem' }}>· {sent} enviados</span>}</>
                      }
                    </h1>
                    {generating && (
                      <div style={{ marginTop: '8px', background: 'var(--bg)', borderRadius: '100px', height: '4px', width: '200px' }}>
                        <div style={{ background: 'var(--accent)', height: '100%', borderRadius: '100px', width: `${pct}%`, transition: 'width 0.3s ease' }} />
                      </div>
                    )}
                  </div>

                  {!generating && done > 0 && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {leadsComEmail > 0 && (
                        <button
                          onClick={handleSendEmails}
                          disabled={sending}
                          style={{ background: 'transparent', border: '1px solid var(--green)', borderRadius: '8px', padding: '12px 22px', color: 'var(--green)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.9rem', cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          {sending ? <><span className="spinner" /> Enviando...</> : `✉ Disparar E-mails (${leadsComEmail})`}
                        </button>
                      )}
                      <button
                        onClick={() => exportLeadsToCSV(leads, originalRows)}
                        style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', padding: '12px 22px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                      >
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

        {tab === 'manual' && (
          <div className="fade-in">
            <div style={{ marginBottom: '24px' }}>
              <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.75rem' }}>Lead <span style={{ color: 'var(--accent)' }}>Manual</span></h1>
              <p style={{ color: 'var(--text-muted)', marginTop: '6px', fontSize: '0.9rem' }}>Para leads estratégicos do LinkedIn. Quanto mais contexto do perfil, mais personalizada a mensagem.</p>
            </div>
            <LeadForm />
          </div>
        )}
      </main>
    </div>
  )
}
