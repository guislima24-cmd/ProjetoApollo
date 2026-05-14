'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MemberDistribution } from '@/lib/members.config'

interface MembroStats extends MemberDistribution {
  total_ativos:    number
  enviados_semana: number
  responderam:     number
  pendentes_fila:  number
}

interface DashboardData {
  statusCounts:   Record<string, number>
  membros:        MembroStats[]
  taxaAceitacao:  number
  taxaResposta:   number
  totalLeads:     number
}

const STATUS_LABELS: Record<string, string> = {
  nao_atribuido:        'Não atribuído',
  nao_contatado:        'Não contatado',
  enriquecido:          'Enriquecido',
  conexao_enviada:      'Conexão enviada',
  conexao_aceita:       'Conexão aceita',
  mensagem_enviada:     'Mensagem enviada',
  followup_1_enviado:   'Follow-up 1',
  followup_2_enviado:   'Follow-up 2',
  respondeu:            'Respondeu',
  descartado:           'Descartado',
  erro_enriquecimento:  'Erro enriquecimento',
}

export default function DashboardClient() {
  const [data, setData]             = useState<DashboardData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [pausando, setPausando]     = useState<string | null>(null)
  const [enriquecendo, setEnriq]    = useState(false)
  const [enrichMsg, setEnrichMsg]   = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/dashboard')
      if (!res.ok) throw new Error('Erro ao carregar')
      setData(await res.json())
    } catch {
      setError('Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function pausarMembro(email: string, nome: string) {
    if (!confirm(`Redistribuir leads pendentes de ${nome} para os outros membros?`)) return
    setPausando(email)
    try {
      const res = await fetch('/api/admin/pausar-membro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await res.json()
      if (d.ok) {
        alert(`${d.redistribuidos} leads redistribuídos com sucesso.`)
        await carregar()
      } else {
        alert(d.error ?? 'Erro ao pausar membro.')
      }
    } catch {
      alert('Erro de rede.')
    } finally {
      setPausando(null)
    }
  }

  async function rodarEnriquecimento() {
    setEnriq(true)
    setEnrichMsg(null)
    try {
      const res  = await fetch('/api/admin/enrich-leads', { method: 'POST' })
      const d    = await res.json()
      setEnrichMsg(d.ok
        ? `Enriquecidos: ${d.enriquecidos}, Erros: ${d.erros}`
        : (d.error ?? 'Erro'))
      if (d.ok) await carregar()
    } catch {
      setEnrichMsg('Erro de rede.')
    } finally {
      setEnriq(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
      <p className="text-gray-500 text-sm">Carregando...</p>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
      <p className="text-red-400 text-sm">{error ?? 'Sem dados'}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold">Painel Admin</h1>
            <p className="text-gray-400 text-sm mt-0.5">{data.totalLeads} leads no sistema</p>
          </div>
          <button
            onClick={rodarEnriquecimento}
            disabled={enriquecendo}
            className="px-4 py-2 bg-[#00e5bf] text-black text-sm font-semibold rounded-lg
              hover:bg-[#00cca8] disabled:opacity-40 transition"
          >
            {enriquecendo ? 'Enriquecendo...' : 'Rodar enriquecimento'}
          </button>
        </div>

        {enrichMsg && (
          <div className="mb-6 bg-white/5 rounded-xl p-4 text-sm text-gray-300">
            {enrichMsg}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <KpiCard label="Total de leads"    valor={data.totalLeads}         />
          <KpiCard label="Taxa de aceitação" valor={`${data.taxaAceitacao}%`} />
          <KpiCard label="Taxa de resposta"  valor={`${data.taxaResposta}%`}  />
          <KpiCard label="Responderam"       valor={data.statusCounts['respondeu'] ?? 0} />
        </div>

        {/* Status breakdown */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Leads por status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{label}</span>
                <span className="font-semibold">{data.statusCounts[k] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Members table */}
        <div className="bg-[#111] border border-white/10 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-white/10">
            <h2 className="text-sm font-semibold text-gray-300">Membros</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-white/5">
                  <th className="text-left p-3 pl-5">Nome</th>
                  <th className="text-right p-3">Ativos</th>
                  <th className="text-right p-3">Enviados (semana)</th>
                  <th className="text-right p-3">Na fila</th>
                  <th className="text-right p-3">Responderam</th>
                  <th className="p-3 pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {data.membros.map(m => (
                  <tr key={m.email} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                    <td className="p-3 pl-5">
                      <div className="font-medium">{m.nome}</div>
                      <div className="text-gray-500 text-xs">{m.email}</div>
                    </td>
                    <td className="p-3 text-right">{m.total_ativos}</td>
                    <td className="p-3 text-right">{m.enviados_semana}</td>
                    <td className="p-3 text-right">{m.pendentes_fila}</td>
                    <td className="p-3 text-right text-[#00e5bf]">{m.responderam}</td>
                    <td className="p-3 pr-5 text-right">
                      <button
                        onClick={() => pausarMembro(m.email, m.nome)}
                        disabled={pausando === m.email}
                        className="text-xs text-orange-400 hover:text-orange-300 disabled:opacity-40 transition"
                      >
                        {pausando === m.email ? 'Redistribuindo...' : 'Pausar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}

function KpiCard({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div className="bg-[#111] border border-white/10 rounded-xl p-4">
      <div className="text-2xl font-bold mb-1">{valor}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}
