'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

interface PreviewRow {
  nome_empresa:  string
  nome_decisor:  string
  cargo_decisor: string
  cidade:        string
}

interface PreviewResult {
  total:      number
  novos:      number
  duplicados: number
  preview:    PreviewRow[]
}

interface FinalResult {
  atribuidos:   number
  duplicados:   number
  sem_vaga:     number
  por_membro:   Record<string, number>
  enriquecidos: number
  erros_ia:     number
}

type Etapa = 'idle' | 'analisando' | 'preview' | 'importando' | 'enriquecendo' | 'done'

export default function ImportApolloPage() {
  const [file, setFile]       = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult]   = useState<FinalResult | null>(null)
  const [etapa, setEtapa]     = useState<Etapa>('idle')
  const [error, setError]     = useState<string | null>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  async function handleAnalisar() {
    if (!file) return
    setEtapa('analisando')
    setError(null)
    setPreview(null)
    setResult(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('action', 'preview')

    try {
      const res  = await fetch('/api/admin/import-apollo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro desconhecido'); setEtapa('idle'); return }
      setPreview(data)
      setEtapa('preview')
    } catch (e) {
      setError(String(e))
      setEtapa('idle')
    }
  }

  async function handleImportarEEnriquecer() {
    if (!file) return
    setError(null)

    setEtapa('importando')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('action', 'distribute')

    let distData: any
    try {
      const res  = await fetch('/api/admin/import-apollo', { method: 'POST', body: fd })
      distData   = await res.json()
      if (!res.ok) { setError(distData.error ?? 'Erro na distribuição'); setEtapa('preview'); return }
    } catch (e) {
      setError(String(e))
      setEtapa('preview')
      return
    }

    setEtapa('enriquecendo')
    let enrichData: any = { processados: 0, erros: 0 }
    try {
      const res  = await fetch('/api/admin/enrich-leads', { method: 'POST' })
      enrichData = await res.json()
    } catch { /* enriquecimento não bloqueia */ }

    setResult({
      atribuidos:   distData.summary?.atribuidos   ?? 0,
      duplicados:   distData.summary?.duplicados   ?? 0,
      sem_vaga:     distData.summary?.sem_vaga      ?? 0,
      por_membro:   distData.summary?.por_membro    ?? {},
      enriquecidos: enrichData.processados          ?? 0,
      erros_ia:     enrichData.erros                ?? 0,
    })

    setPreview(null)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
    setEtapa('done')
  }

  function reiniciar() {
    setEtapa('idle')
    setPreview(null)
    setResult(null)
    setError(null)
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
          Importar CSV do Apollo
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          Apollo.io → Export → CSV. O sistema distribui entre os membros e já gera as mensagens de LinkedIn.
        </p>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          color: 'var(--red)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Resultado final */}
      {etapa === 'done' && result && (
        <div className="card" style={{ borderColor: 'var(--green-primary)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', fontFamily: 'Syne, sans-serif', marginBottom: 20 }}>
            ✓ Tudo pronto!
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16, marginBottom: 20 }}>
            <Stat label="Leads atribuídos"  value={result.atribuidos}   color="var(--green)" />
            <Stat label="Enriquecidos (IA)" value={result.enriquecidos} color="var(--green)" />
            <Stat label="Duplicados"        value={result.duplicados}   color="var(--gold)" />
            {result.sem_vaga > 0  && <Stat label="Sem vaga"  value={result.sem_vaga}  color="var(--yellow)" />}
            {result.erros_ia > 0  && <Stat label="Erros IA"  value={result.erros_ia}  color="var(--red)" />}
          </div>

          {Object.keys(result.por_membro).length > 0 && (
            <>
              <p className="section-label" style={{ marginBottom: 10 }}>Por membro</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 24 }}>
                {Object.entries(result.por_membro)
                  .sort(([, a], [, b]) => b - a)
                  .map(([email, count]) => (
                    <div key={email} style={{
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '8px 12px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 13,
                    }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{email.split('@')[0]}</span>
                      <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{count}</span>
                    </div>
                  ))}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/dashboard/fila" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Ir para a fila →
            </Link>
            <button className="btn-secondary" onClick={reiniciar}>
              Importar outro CSV
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {(etapa === 'importando' || etapa === 'enriquecendo') && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div className="spinner" style={{ width: 24, height: 24, marginBottom: 16 }} />
          <p style={{ fontWeight: 600, color: 'var(--cream)', marginBottom: 6 }}>
            {etapa === 'importando' ? 'Distribuindo leads...' : 'Enriquecendo com IA...'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {etapa === 'enriquecendo'
              ? 'Gerando mensagens personalizadas. Pode levar até 2 minutos.'
              : 'Atribuindo leads aos membros do time.'}
          </p>
        </div>
      )}

      {/* Upload + Preview */}
      {(etapa === 'idle' || etapa === 'analisando' || etapa === 'preview') && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <label className="section-label" style={{ display: 'block', marginBottom: 12 }}>Arquivo CSV</label>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setEtapa('idle') }}
              style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 16 }}
            />
            <button
              className="btn-secondary"
              onClick={handleAnalisar}
              disabled={!file || etapa === 'analisando'}
            >
              {etapa === 'analisando' ? 'Analisando...' : 'Analisar CSV'}
            </button>
          </div>

          {preview && (
            <div className="card">
              <div style={{ display: 'flex', gap: 32, marginBottom: 20 }}>
                <Stat label="Total no CSV" value={preview.total} />
                <Stat label="Leads novos"  value={preview.novos}      color="var(--green)" />
                <Stat label="Duplicados"   value={preview.duplicados} color="var(--gold)" />
              </div>

              {preview.novos === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Todos os leads já existem na planilha (últimos 90 dias).
                </p>
              ) : (
                <>
                  <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Empresa', 'Decisor', 'Cargo', 'Cidade'].map(col => (
                            <th key={col} style={{
                              textAlign: 'left', padding: '8px 12px 8px 0',
                              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.07em', color: 'var(--text-muted)',
                            }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 12px 9px 0', fontWeight: 600, color: 'var(--cream)' }}>{r.nome_empresa}</td>
                            <td style={{ padding: '9px 12px 9px 0', color: 'var(--text-secondary)' }}>{r.nome_decisor || '—'}</td>
                            <td style={{ padding: '9px 12px 9px 0', color: 'var(--text-muted)' }}>{r.cargo_decisor || '—'}</td>
                            <td style={{ padding: '9px 0', color: 'var(--text-muted)' }}>{r.cidade || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button className="btn-primary" onClick={handleImportarEEnriquecer}>
                    Importar e enriquecer {preview.novos} leads
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}

function Stat({ label, value, color = 'var(--cream)' }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: 'Syne, sans-serif' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
