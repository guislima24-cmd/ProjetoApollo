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

const LABEL_ABA: Record<Aba, string> = {
  conexoes:   'Conexões',
  boas_vindas: 'Boas-vindas',
  followups:  'Follow-ups',
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as FilaData
      setFila(data)
    } catch {
      setError('Erro ao carregar fila.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage || !extensionId) return
    chrome.runtime.sendMessage(extensionId, { type: 'LI_PING' }, (resp: any) => {
      setExtensaoOk(!!resp?.ok)
    })
  }, [extensionId])

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

    const campo    = CAMPO_POR_ABA[aba] as string
    const mensagem = mensagensEditadas[lead.id_lead] ?? (lead[CAMPO_POR_ABA[aba]] as string)

    if (action === 'enviar' && extensaoOk) {
      const linkedinUrl = aba === 'conexoes' ? lead.linkedin_decisor : lead.link_conversa_linkedin
      const tipoAcao    = aba === 'conexoes' ? 'enviar_conexao' : 'enviar_mensagem'
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
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
          Bom dia, {nomeUsuario}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Sua fila de hoje</p>
      </div>

      {/* Cards de totais */}
      {fila && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          {([
            { label: 'Conexões',   valor: fila.totais.conexoes },
            { label: 'Boas-vindas', valor: fila.totais.boas_vindas },
            { label: 'Follow-ups', valor: fila.totais.followups },
          ] as const).map(({ label, valor }) => (
            <div key={label} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>{valor}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Status extensão */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20,
        fontSize: 12, color: extensaoOk ? 'var(--green)' : 'var(--gold)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: extensaoOk ? 'var(--green)' : 'var(--gold)',
          display: 'inline-block',
        }} />
        {extensaoOk ? 'Extensão conectada — envio automático ativo' : 'Extensão offline — use "Marcar enviado" manualmente'}
      </div>

      {/* Abas */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 4,
      }}>
        {(['conexoes', 'boas_vindas', 'followups'] as Aba[]).map(a => (
          <button
            key={a}
            onClick={() => setAba(a)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 7, border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Syne, sans-serif',
              background: aba === a ? 'var(--green-primary)' : 'transparent',
              color: aba === a ? 'var(--cream)' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {LABEL_ABA[a]}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Carregando...</p>}
      {error   && <p style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>{error}</p>}

      {!loading && !error && leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <p style={{ fontSize: 13 }}>Nenhum lead nesta fila agora.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {leads.map(lead => (
          <LeadCard
            key={lead.id_lead}
            lead={lead}
            aba={aba}
            mensagemEditada={mensagensEditadas[lead.id_lead] ?? null}
            onMensagemEdit={msg => setMensagensEditadas(prev => ({ ...prev, [lead.id_lead]: msg }))}
            onAcao={action => executarAcao(lead, action)}
            loading={pendingId === lead.id_lead}
            extensaoOk={extensaoOk}
          />
        ))}
      </div>

      {leads.length > 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, marginTop: 24 }}>
          Atalho:{' '}
          <kbd style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>E</kbd>
          {' '}envia ·{' '}
          <kbd style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>Esc</kbd>
          {' '}pula
        </p>
      )}
    </main>
  )
}

function abaAtual(fila: FilaData | null, aba: Aba): LeadMaster[] {
  if (!fila) return []
  return fila[aba === 'boas_vindas' ? 'boas_vindas' : aba] ?? []
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
  const campoMsg    = CAMPO_POR_ABA[aba]
  const mensagem    = mensagemEditada ?? (lead[campoMsg] as string) ?? ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const linkedinUrl = aba === 'conexoes'
    ? lead.linkedin_decisor
    : (lead.link_conversa_linkedin || lead.linkedin_decisor)

  const diasConexao = lead.data_atribuicao
    ? Math.floor((Date.now() - new Date(lead.data_atribuicao).getTime()) / 86_400_000)
    : null

  return (
    <div className="card" style={{
      opacity: loading ? 0.5 : 1,
      pointerEvents: loading ? 'none' : 'auto',
      transition: 'opacity 0.15s',
    }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 15 }}>
            {lead.nome_decisor || '—'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            {lead.cargo_decisor || 'Cargo não informado'}
            {' · '}
            <span style={{ color: 'var(--cream)' }}>{lead.nome_empresa}</span>
          </div>
          {lead.setor && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}
            </div>
          )}
        </div>
        {linkedinUrl && (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--green-primary)', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 16 }}
          >
            Ver LinkedIn ↗
          </a>
        )}
      </div>

      {aba === 'conexoes' && lead.gancho_personalizado && (
        <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 12, fontStyle: 'italic' }}>
          {lead.gancho_personalizado}
        </div>
      )}

      {aba !== 'conexoes' && diasConexao !== null && diasConexao > 0 && (
        <div style={{ fontSize: 12, color: 'var(--yellow)', marginBottom: 8 }}>
          Aceitou há {diasConexao} dias
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={mensagem}
        onChange={e => onMensagemEdit(e.target.value)}
        rows={5}
        className="input"
        style={{ resize: 'vertical', marginBottom: 14 }}
        placeholder="Mensagem..."
      />

      {/* Botões */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={() => onAcao('enviar')} disabled={loading}>
          {extensaoOk ? 'Enviar' : 'Marcar enviado'}
        </button>
        <button className="btn-secondary" onClick={() => onAcao('pular')} disabled={loading}>
          Pular
        </button>
        <button
          onClick={() => onAcao('descartar')}
          disabled={loading}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 13, color: 'var(--red)', padding: '9px 12px', borderRadius: 8,
            opacity: loading ? 0.4 : 0.7, transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = loading ? '0.4' : '0.7')}
        >
          Descartar
        </button>
      </div>
    </div>
  )
}
