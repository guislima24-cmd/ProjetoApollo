'use client'

import { useState, useRef } from 'react'

interface PreviewRow {
  nome_empresa:  string
  nome_decisor:  string
  cargo_decisor: string
  cidade:        string
  setor:         string
}

interface PreviewResult {
  total:      number
  novos:      number
  duplicados: number
  preview:    PreviewRow[]
}

interface DistributionSummary {
  total:      number
  atribuidos: number
  duplicados: number
  sem_vaga:   number
  por_membro: Record<string, number>
}

export default function ImportApolloPage() {
  const [file, setFile]         = useState<File | null>(null)
  const [preview, setPreview]   = useState<PreviewResult | null>(null)
  const [summary, setSummary]   = useState<DistributionSummary | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const inputRef                = useRef<HTMLInputElement>(null)

  async function handlePreview() {
    if (!file) return
    setLoading(true)
    setError(null)
    setPreview(null)
    setSummary(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('action', 'preview')

    try {
      const res  = await fetch('/api/admin/import-apollo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro desconhecido'); return }
      setPreview(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleDistribute() {
    if (!file) return
    setLoading(true)
    setError(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('action', 'distribute')

    try {
      const res  = await fetch('/api/admin/import-apollo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erro desconhecido'); return }
      setSummary(data.summary)
      setPreview(null)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Importar CSV do Apollo</h1>
      <p className="text-gray-400 mb-8 text-sm">
        Exporta do Apollo.io → People ou Companies → Export CSV. O sistema deduplica e distribui automaticamente.
      </p>

      {/* Upload */}
      <div className="bg-[#111] border border-white/10 rounded-xl p-6 mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-3">Arquivo CSV</label>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setSummary(null) }}
          className="block w-full text-sm text-gray-400
            file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
            file:text-sm file:font-medium file:bg-[#00e5bf]/10 file:text-[#00e5bf]
            hover:file:bg-[#00e5bf]/20 cursor-pointer"
        />
        <button
          onClick={handlePreview}
          disabled={!file || loading}
          className="mt-4 px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium
            disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Analisando...' : 'Analisar CSV'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-xl p-4 mb-6 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="bg-[#111] border border-white/10 rounded-xl p-6 mb-6">
          <div className="flex gap-6 mb-6">
            <Stat label="Total no CSV"  value={preview.total}      />
            <Stat label="Leads novos"   value={preview.novos}      color="text-[#00e5bf]" />
            <Stat label="Duplicados"    value={preview.duplicados} color="text-yellow-400" />
          </div>

          {preview.novos === 0 ? (
            <p className="text-gray-500 text-sm">Todos os leads já existem na planilha (últimos 90 dias).</p>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-3">
                Amostra dos primeiros {preview.preview.length} leads novos:
              </p>
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
                onClick={handleDistribute}
                disabled={loading}
                className="px-6 py-2.5 rounded-lg bg-[#00e5bf] text-black font-semibold text-sm
                  hover:bg-[#00cca8] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Distribuindo...' : `Distribuir ${preview.novos} leads`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Resultado */}
      {summary && (
        <div className="bg-[#111] border border-[#00e5bf]/30 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-[#00e5bf] mb-4">✓ Distribuição concluída</h2>
          <div className="flex gap-6 mb-6">
            <Stat label="Atribuídos"      value={summary.atribuidos} color="text-[#00e5bf]" />
            <Stat label="Duplicados"      value={summary.duplicados} color="text-yellow-400" />
            <Stat label="Sem vaga (fila)" value={summary.sem_vaga}   color="text-orange-400" />
          </div>

          <p className="text-sm text-gray-400 mb-3 font-medium">Por membro:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(summary.por_membro)
              .sort(([, a], [, b]) => b - a)
              .map(([email, count]) => (
                <div key={email} className="bg-white/5 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-300">{email.split('@')[0]}</span>
                  <span className="ml-2 font-bold text-white">{count}</span>
                </div>
              ))}
          </div>
        </div>
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
