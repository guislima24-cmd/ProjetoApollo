'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { LeadMaster } from '@/lib/types/lead'

type Aba = 'conexoes' | 'boas_vindas' | 'followups'

interface FilaData {
  conexoes:    LeadMaster[]
  boas_vindas:  LeadMaster[]
  followups:   LeadMaster[]
  totais:      { conexoes: number; boas_vindas: number; followups: number }
}

const CAMPO_POR_ABA: Record<Aba, keyof LeadMaster> = {
  conexoes:   'nota_conexao',
  boas_vindas: 'mensagem_boas_vindas',
  followups:  'followup_1',
}

declare const chrome: any

export default function FilaClient({ nomeUsuario, email }: { nomeUsuario: string; email: string }) {
  const [aba, setAba]             = useState<Aba>('conexoes')
  const [fila, setFila]           = useState<FilaData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [extensaoOk, setExtensaoOk] = useState(false)
  const [mensagensEditadas, setMensagensEditadas] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)

  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID ?? ''

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/leads/fila')
      const data = await res.json() as FilaData
      setFila(data)
    } catch {
      setError('Erro ao carregar fila.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Checa se extensão está conectada
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage || !extensionId) return
    chrome.runtime.sendMessage(extensionId, { type: 'AGENT_PING' }, (resp: any) => {
      setExtensaoOk(!!resp?.ok)
    })
  }, [extensionId])

  // Keyboard shortcut: E = enviar, Esc = pular
  useEffect(() => {
    const leads = abaAtual(fila, aba)
    if (!leads.length) return
    const lead = leads[0]
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === 'e' || e.key === 'E') executarAcao(lead, 'enviar')
      if (e.key === 'Escape') executarAcao(lead, 'pular')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fila, aba, mensagensEditadas])

  async function executarAcao(lead: LeadMaster, action: 'enviar' | 'pular' | 'descartar') {
    if (pendingId) return
    setPendingId(lead.id_lead)

    const campo = CAMPO_POR_ABA[aba] as string
    const mensagem = mensagensEditadas[lead.id_lead] ?? (lead[CAMPO_POR_ABA[aba]] as string)

    if (action === 'enviar' && extensaoOk) {
      const linkedinUrl = aba === 'conexoes' ? lead.linkedin_decisor : lead.link_conversa_linkedin
      const tipoAcao = aba === 'conexoes' ? 'enviar_conexao' : 'enviar_mensagem'
      chrome.runtime.sendMessage(extensionId, {
        type: 'LI_SEND_REQUEST',
        action: tipoAcao,
        lead_id: lead.id_lead,
        mensagem,
        linkedin_url: linkedinUrl,
      }, async (resp: any) => {
        if (resp?.ok) {
          await confirmarEnvio(lead, action, mensagem, campo)
        } else {
          alert(resp?.error ?? 'Erro na extensão.')
          setPendingId(null)
        }
      })
      return
    }

    await confirmarEnvio(lead, action, mensagem, campo)
  }

  async function confirmarEnvio(lead: LeadMaster, action: 'enviar' | 'pular' | 'descartar', mensagem: string, campo: string) {
    try {
      await fetch('/api/leads/action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id:        lead.id_lead,
          action,
          mensagem:       action === 'enviar' ? mensagem : undefined,
          campo_mensagem: action === 'enviar' ? campo    : undefined,
        }),
      })
      await carregar()
      setMensagensEditadas(prev => { const n = { ...prev }; delete n[lead.id_lead]; return n })
    } catch {
      setError('Erro ao processar ação.')
    } finally {
      setPendingId(null)
    }
  }

  const leads = fila ? abaAtual(fila, aba) : []

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold">Bom dia, {nomeUsuario}</h1>
          <p className="text-gray-400 text-sm mt-0.5">Sua fila de hoje</p>
        </div>

        {/* Resumo */}
        {fila && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <ResumoCard emoji="📨" label="Conexões pendentes" valor={fila.totais.conexoes} />
            <ResumoCard emoji="💬" label="Boas-vindas"         valor={fila.totais.boas_vindas} />
            <ResumoCard emoji="🔁" label="Follow-ups"         valor={fila.totais.followups} />
          </div>
        )}

        {/* Status extensão */}
        <div className={`text-xs mb-4 flex items-center gap-1.5 ${extensaoOk ? 'text-[#00e5bf]' : 'text-yellow-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${extensaoOk ? 'bg-[#00e5bf]' : 'bg-yellow-500'}`} />
          {extensaoOk ? 'Extensão conectada — envio automático ativo' : 'Extensão offline — use "Marcar enviado" manualmente'}
        </div>

        {/* Abas */}
        <div className="flex gap-1 mb-5 bg-white/5 rounded-xl p-1">
          {(['conexoes', 'boas_vindas', 'followups'] as Aba[]).map(a => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition
                ${aba === a ? 'bg-[#00e5bf] text-black' : 'text-gray-400 hover:text-white'}`}
            >
              {LABEL_ABA[a]}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && <p className="text-gray-500 text-sm text-center py-8">Carregando...</p>}
        {error   && <p className="text-red-400 text-sm text-center py-4">{error}</p>}

        {!loading && !error && leads.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-2xl mb-2">✓</p>
            <p className="text-sm">Nenhum lead nesta fila agora.</p>
          </div>
        )}

        <div className="space-y-4">
          {leads.map(lead => (
            <LeadCard
              key={lead.id_lead}
              lead={lead}
              aba={aba}
              mensagemEditada={mensagensEditadas[lead.id_lead] ?? null}
              onMensagemEdit={msg =>
                setMensagensEditadas(prev => ({ ...prev, [lead.id_lead]: msg }))
              }
              onAcao={action => executarAcao(lead, action)}
              loading={pendingId === lead.id_lead}
              extensaoOk={extensaoOk}
            />
          ))}
        </div>

        {leads.length > 0 && (
          <p className="text-center text-gray-600 text-xs mt-6">
            Atalho: <kbd className="bg-white/10 px-1 rounded">E</kbd> envia · <kbd className="bg-white/10 px-1 rounded">Esc</kbd> pula
          </p>
        )}
      </div>
    </div>
  )
}

// ── Componentes ───────────────────────────────────────────────────────────────

const LABEL_ABA: Record<Aba, string> = {
  conexoes:   'Conexões',
  boas_vindas: 'Boas-vindas',
  followups:  'Follow-ups',
}

function abaAtual(fila: FilaData | null, aba: Aba): LeadMaster[] {
  if (!fila) return []
  return fila[aba === 'boas_vindas' ? 'boas_vindas' : aba] ?? []
}

function ResumoCard({ emoji, label, valor }: { emoji: string; label: string; valor: number }) {
  return (
    <div className="bg-[#111] border border-white/10 rounded-xl p-4">
      <div className="text-xl mb-1">{emoji}</div>
      <div className="text-2xl font-bold">{valor}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function LeadCard({ lead, aba, mensagemEditada, onMensagemEdit, onAcao, loading, extensaoOk }: {
  lead:            LeadMaster
  aba:             Aba
  mensagemEditada: string | null
  onMensagemEdit:  (m: string) => void
  onAcao:          (a: 'enviar' | 'pular' | 'descartar') => void
  loading:         boolean
  extensaoOk:      boolean
}) {
  const campoMsg   = CAMPO_POR_ABA[aba]
  const mensagem   = mensagemEditada ?? (lead[campoMsg] as string) ?? ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const linkedinUrl = aba === 'conexoes'
    ? lead.linkedin_decisor
    : (lead.link_conversa_linkedin || lead.linkedin_decisor)

  const diasConexao = lead.data_atribuicao
    ? Math.floor((Date.now() - new Date(lead.data_atribuicao).getTime()) / 86_400_000)
    : null

  return (
    <div className={`bg-[#111] border rounded-xl p-5 transition ${loading ? 'opacity-50 pointer-events-none' : 'border-white/10 hover:border-white/20'}`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-semibold">{lead.nome_decisor || '—'}</div>
          <div className="text-sm text-gray-400">
            {lead.cargo_decisor || 'Cargo não informado'}
            {' · '}
            <span className="text-gray-300">{lead.nome_empresa}</span>
          </div>
          {lead.setor && <div className="text-xs text-gray-600 mt-0.5">{lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}</div>}
        </div>
        {linkedinUrl && (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#00e5bf] hover:underline whitespace-nowrap ml-4"
          >
            Ver LinkedIn ↗
          </a>
        )}
      </div>

      {aba === 'conexoes' && lead.gancho_personalizado && (
        <div className="text-xs text-yellow-400/80 mb-3 italic">{lead.gancho_personalizado}</div>
      )}

      {aba !== 'conexoes' && diasConexao !== null && diasConexao > 0 && (
        <div className="text-xs text-orange-400/80 mb-2">Aceitou há {diasConexao} dias</div>
      )}

      {/* Mensagem editável */}
      <textarea
        ref={textareaRef}
        value={mensagem}
        onChange={e => onMensagemEdit(e.target.value)}
        rows={5}
        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg p-3 text-sm text-gray-200
          resize-y focus:outline-none focus:border-[#00e5bf]/50 mb-4"
        placeholder="Mensagem..."
      />

      {/* Botões */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onAcao('enviar')}
          disabled={loading}
          className="px-4 py-2 bg-[#00e5bf] text-black text-sm font-semibold rounded-lg
            hover:bg-[#00cca8] disabled:opacity-40 transition"
        >
          {extensaoOk ? 'Enviar' : 'Marcar enviado'}
        </button>
        <button
          onClick={() => onAcao('pular')}
          disabled={loading}
          className="px-4 py-2 bg-white/10 text-sm rounded-lg hover:bg-white/20 transition"
        >
          Pular
        </button>
        <button
          onClick={() => onAcao('descartar')}
          disabled={loading}
          className="px-4 py-2 text-red-400/70 text-sm rounded-lg hover:text-red-400 hover:bg-red-900/20 transition"
        >
          Descartar
        </button>
      </div>
    </div>
  )
}
