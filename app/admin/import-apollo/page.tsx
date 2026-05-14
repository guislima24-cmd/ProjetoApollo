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

type Etapa = 'idle' | 'preview' | 'importando' | 'enriquecendo' | 'done'

export default function ImportApolloPage() {
  const [file, setFile]         = useState<File | null>(null)
  const [preview, setPreview]   = useState<PreviewResult | null>(null)
  const [result, setResult]     = useState<FinalResult | null>(null)
  const [etapa, setEtapa]       = useState<Etapa>('idle')
  const [error, setError]       = useState<string | null>(null)
  const inputRef                = useRef<HTMLInputElement>(null)

  async function handleAnalysar() {
    if (!file) return
    setEtapa('preview')
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
    } catch (e) {
      setError(String(e))
      setEtapa('idle')
    }
  }

  async function handleImportarEEnriquecer() {
    if (!file) return
    setError(null)

    // — Etapa 1: distribuir —
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

    // — Etapa 2: enriquecer —
    setEtapa('enriquecendo')
    let enrichData: any = { processados: 0, erros: 0 }
    try {
      const res  = await fetch('/api/admin/enrich-leads', { method: 'POST' })
      enrichData = await res.json()
    } catch {
      // enriquecimento falhou mas a distribuição foi OK — não bloqueia
    }

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
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Importar CSV do Apollo</h1>
      <p className="text-gray-400 mb-8 text-sm">
        Apollo.io → Export → CSV. O sistema distribui entre os membros e já gera as mensagens de LinkedIn.
      </p>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-4 mb-6 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Resultado final */}
      {etapa === 'done' && result && (
        <div className="bg-[#111] border border-[#00e5bf]/30 rounded-xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-[#00e5bf]">Tudo pronto!</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Leads atribuídos"  value={result.atribuidos}   color="text-[#00e5bf]" />
            <Stat label="Enriquecidos (IA)" value={result.enriquecidos} color="text-[#00e5bf]" />
            <Stat label="Duplicados"        value={result.duplicados}   color="text-yellow-400" />
            {result.sem_vaga > 0 && <Stat label="Sem vaga"  value={result.sem_vaga}  color="text-orange-400" />}
            {result.erros_ia > 0 && <Stat label="Erros IA"  value={result.erros_ia}  color="text-red-400" />}
          </div>

          {Object.keys(result.por_membro).length > 0 && (
            <>
              <p className="text-sm text-gray-400 font-medium">Por membro:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(result.por_membro)
                  .sort(([, a], [, b]) => b - a)
                  .map(([email, count]) => (
                    <div key={email} className="bg-white/5 rounded-lg px-3 py-2 text-sm flex justify-between">
                      <span className="text-gray-300">{email.split('@')[0]}</span>
                      <span className="font-bold">{count}</span>
                    </div>
                  ))}
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/dashboard/fila"
              className="px-5 py-2.5 rounded-lg bg-[#00e5bf] text-black font-semibold text-sm hover:bg-[#00cca8] transition"
            >
              Ir para a fila →
            </Link>
            <button
              onClick={reiniciar}
              className="px-5 py-2.5 rounded-lg bg-white/10 text-sm hover:bg-white/20 transition"
            >
              Importar outro CSV
            </button>
          </div>
        </div>
      )}

      {/* Loading states */}
      {(etapa === 'importando' || etapa === 'enriquecendo') && (
        <div className="bg-[#111] border border-white/10 rounded-xl p-8 text-center space-y-3">
          <div className="text-3xl animate-pulse">
            {etapa === 'importando' ? '📋' : '🤖'}
          </div>
          <p className="font-medium">
            {etapa === 'importando' ? 'Distribuindo leads...' : 'Enriquecendo com IA...'}
          </p>
          <p className="text-sm text-gray-500">
            {etapa === 'enriquecendo'
              ? 'Gerando mensagens personalizadas para cada lead. Pode levar até 2 minutos.'
              : 'Atribuindo leads aos membros do time.'}
          </p>
        </div>
      )}

      {/* Upload + Preview */}
      {(etapa === 'idle' || etapa === 'preview') && (
        <>
          <div className="bg-[#111] border border-white/10 rounded-xl p-6 mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">Arquivo CSV</label>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={e => {
                setFile(e.target.files?.[0] ?? null)
                setPreview(null)
                setEtapa('idle')
              }}
              className="block w-full text-sm text-gray-400
                file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-medium file:bg-[#00e5bf]/10 file:text-[#00e5bf]
                hover:file:bg-[#00e5bf]/20 cursor-pointer"
            />
            <button
              onClick={handleAnalysar}
              disabled={!file || etapa === 'preview'}
              className="mt-4 px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium
                disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {etapa === 'preview' && !preview ? 'Analisando...' : 'Analisar CSV'}
            </button>
          </div>

          {preview && (
            <div className="bg-[#111] border border-white/10 rounded-xl p-6">
              <div className="flex gap-6 mb-6">
                <Stat label="Total no CSV" value={preview.total}      />
                <Stat label="Leads novos"  value={preview.novos}      color="text-[#00e5bf]" />
                <Stat label="Duplicados"   value={preview.duplicados} color="text-yellow-400" />
              </div>

              {preview.novos === 0 ? (
                <p className="text-gray-500 text-sm">Todos os leads já existem na planilha (últimos 90 dias).</p>
              ) : (
                <>
                  <div className="overflow-x-auto mb-5">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 border-b border-white/10">
                          <th className="text-left py-2 pr-4">Empresa</th>
                          <th className="text-left py-2 pr-4">Decisor</th>
                          <th className="text-left py-2 pr-4">Cargo</th>
                          <th className="text-left py-2">Cidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((r, i) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="py-2 pr-4 font-medium">{r.nome_empresa}</td>
                            <td className="py-2 pr-4 text-gray-300">{r.nome_decisor || '—'}</td>
                            <td className="py-2 pr-4 text-gray-400">{r.cargo_decisor || '—'}</td>
                            <td className="py-2 text-gray-400">{r.cidade || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={handleImportarEEnriquecer}
                    className="px-6 py-2.5 rounded-lg bg-[#00e5bf] text-black font-semibold text-sm
                      hover:bg-[#00cca8] transition"
                  >
                    Importar e enriquecer {preview.novos} leads
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
