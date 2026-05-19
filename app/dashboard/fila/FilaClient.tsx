'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { LeadMaster } from '@/lib/types/lead'

type Aba = 'conexoes' | 'followups'

interface FilaData {
  conexoes:  LeadMaster[]
  followups: LeadMaster[]
  totais:    { conexoes: number; followups: number }
}

interface CompanyGroup {
  empresa:          string
  setor:            string
  cidade:           string
  site:             string
  linkedin_empresa: string
  leads:            LeadMaster[]
}

const CAMPO_POR_ABA: Record<Aba, keyof LeadMaster> = {
  conexoes:  'nota_conexao',
  followups: 'followup_1',
}

const LABEL_ABA: Record<Aba, string> = {
  conexoes:  'Conexões',
  followups: 'Follow-ups',
}

declare const chrome: any

function groupByEmpresa(leads: LeadMaster[]): CompanyGroup[] {
  const map = new Map<string, CompanyGroup>()
  for (const lead of leads) {
    const key = lead.nome_empresa || '—'
    if (!map.has(key)) {
      map.set(key, {
        empresa:          lead.nome_empresa,
        setor:            lead.setor,
        cidade:           lead.cidade,
        site:             lead.site,
        linkedin_empresa: lead.linkedin_empresa,
        leads:            [],
      })
    }
    map.get(key)!.leads.push(lead)
  }
  return Array.from(map.values())
}

function extractDomain(site: string): string {
  if (!site) return ''
  try {
    const url = site.startsWith('http') ? site : `https://${site}`
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function CompanyLogo({ site, name }: { site: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const domain = extractDomain(site)

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  if (domain && !failed) {
    return (
      <img
        src={`https://logo.clearbit.com/${domain}`}
        alt={name}
        onError={() => setFailed(true)}
        style={{
          width: 32, height: 32, borderRadius: 6, objectFit: 'contain',
          background: '#fff', padding: 2, flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div style={{
      width: 32, height: 32, borderRadius: 6, flexShrink: 0,
      background: 'var(--green-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 800, color: '#0a0a0a',
    }}>
      {initials || '?'}
    </div>
  )
}

export default function FilaClient({ nomeUsuario }: { nomeUsuario: string; email: string }) {
  const [aba, setAba]             = useState<Aba>('conexoes')
  const [fila, setFila]           = useState<FilaData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [extensaoOk, setExtensaoOk] = useState(false)
  const [mensagensEditadas, setMensagensEditadas] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [avisoExtensao, setAvisoExtensao] = useState<string | null>(null)
  const [lotando, setLotando]             = useState(false)
  const [loteProgresso, setLoteProgresso] = useState<{ feitos: number; total: number } | null>(null)

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
    try {
      chrome.runtime.sendMessage(extensionId, { type: 'LI_PING' }, (resp: any) => {
        void chrome.runtime.lastError  // consume to suppress unchecked-error warning
        setExtensaoOk(!!resp?.ok)
      })
    } catch {
      // Extension not installed or not accepting messages from this origin
    }
  }, [extensionId])

  const leads = fila ? (fila[aba] ?? []) : []

  useEffect(() => {
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
      if (!linkedinUrl) {
        setAvisoExtensao('Este lead não tem LinkedIn cadastrado — não é possível enviar via extensão. Clique em "Descartar" para removê-lo da fila.')
        setPendingId(null)
        return
      }
      chrome.runtime.sendMessage(extensionId, {
        type:         'LI_SEND_REQUEST',
        action:       'enviar_conexao',
        lead_id:      lead.id_lead,
        mensagem,
        linkedin_url: linkedinUrl,
      }, async (resp: any) => {
        void chrome.runtime.lastError
        if (resp?.ok) {
          setAvisoExtensao(null)
          await confirmarEnvio(lead, action, mensagem, campo)
        } else {
          const errMsg = resp?.error ?? 'Erro na extensão.'
          if (errMsg.includes('LIMITE_SEMANAL')) {
            setAvisoExtensao('⚠ Limite semanal de convites do LinkedIn atingido. Envios pausados até segunda-feira.')
          } else if (errMsg.includes('CAPTCHA')) {
            setAvisoExtensao('⚠ CAPTCHA detectado no LinkedIn. Resolva manualmente e tente novamente.')
          } else {
            setAvisoExtensao(errMsg)
          }
          setPendingId(null)
        }
      })
      return
    }

    await confirmarEnvio(lead, action, mensagem, campo)
  }

  async function enviarLote() {
    if (lotando || !extensaoOk || !fila) return
    const lista = [...(fila.conexoes ?? [])]
    if (!lista.length) return
    setLotando(true)
    setAvisoExtensao(null)
    const erros: string[] = []
    const semLinkedin: string[] = []

    for (let i = 0; i < lista.length; i++) {
      const lead = lista[i]
      setLoteProgresso({ feitos: i, total: lista.length })

      if (!lead.linkedin_decisor) {
        semLinkedin.push(lead.nome_decisor || lead.nome_empresa)
        continue
      }

      const campo    = CAMPO_POR_ABA['conexoes'] as string
      const mensagem = mensagensEditadas[lead.id_lead] ?? (lead[CAMPO_POR_ABA['conexoes']] as string)

      const resultado = await new Promise<{ ok: boolean; error?: string }>(resolve => {
        try {
          chrome.runtime.sendMessage(extensionId, {
            type:         'LI_SEND_REQUEST',
            action:       'enviar_conexao',
            lead_id:      lead.id_lead,
            mensagem,
            linkedin_url: lead.linkedin_decisor,
          }, (resp: any) => {
            void chrome.runtime.lastError
            resolve(resp ?? { ok: false, error: 'Sem resposta da extensão' })
          })
        } catch {
          resolve({ ok: false, error: 'Extensão indisponível' })
        }
      })

      if (resultado.ok) {
        await fetch('/api/leads/action', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ lead_id: lead.id_lead, action: 'enviar', mensagem, campo_mensagem: campo }),
        }).catch(() => {})
        setMensagensEditadas(prev => { const n = { ...prev }; delete n[lead.id_lead]; return n })
      } else {
        const errMsg = resultado.error ?? 'Erro desconhecido'
        if (errMsg.includes('LIMITE_SEMANAL')) {
          setAvisoExtensao('⚠ Limite semanal de convites atingido. Lote interrompido.')
          break
        }
        erros.push(`${lead.nome_decisor || lead.nome_empresa}: ${errMsg}`)
      }

      if (i < lista.length - 1) await new Promise(r => setTimeout(r, 3000))
    }

    await carregar()
    setLotando(false)
    setLoteProgresso(null)

    const msgs: string[] = []
    if (erros.length)      msgs.push(`${lista.length - erros.length - semLinkedin.length} enviados, ${erros.length} com erro`)
    if (semLinkedin.length) msgs.push(`${semLinkedin.length} sem LinkedIn (descarte manualmente)`)
    if (msgs.length) setAvisoExtensao(msgs.join(' · '))
  }

  async function confirmarEnvio(lead: LeadMaster, action: 'enviar' | 'pular' | 'descartar', mensagem: string, campo: string) {
    try {
      await fetch('/api/leads/action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
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

  const groups = groupByEmpresa(leads)

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
          Bom dia, {nomeUsuario}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Sua fila de hoje</p>
      </div>

      {/* Totais */}
      {fila && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
          {([
            { label: 'Conexões',   valor: fila.totais.conexoes },
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
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: avisoExtensao ? 8 : 20,
        fontSize: 12, color: extensaoOk ? 'var(--green)' : 'var(--gold)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: extensaoOk ? 'var(--green)' : 'var(--gold)',
          display: 'inline-block',
        }} />
        {extensaoOk ? 'Extensão conectada — envio automático ativo' : 'Extensão offline — use "Marcar enviado" manualmente'}
      </div>

      {/* Aviso */}
      {avisoExtensao && (
        <div style={{
          marginBottom: 20, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: 'rgba(220,80,80,0.1)', border: '1px solid var(--red)',
          color: 'var(--red)', display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ flex: 1 }}>{avisoExtensao}</span>
          <button
            onClick={() => setAvisoExtensao(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14, lineHeight: 1 }}
          >✕</button>
        </div>
      )}

      {/* Abas */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 4,
      }}>
        {(['conexoes', 'followups'] as const).map(a => (
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

      {/* Botão Enviar Tudo */}
      {aba === 'conexoes' && extensaoOk && leads.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {loteProgresso ? (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: 'rgba(74,222,128,0.08)', border: '1px solid var(--green)',
              color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ flex: 1 }}>Enviando… {loteProgresso.feitos}/{loteProgresso.total}</span>
              <div style={{ height: 4, flex: 2, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, background: 'var(--green)',
                  width: `${Math.round((loteProgresso.feitos / loteProgresso.total) * 100)}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ) : (
            <button
              className="btn-primary"
              onClick={enviarLote}
              disabled={lotando || !!pendingId}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Enviar todas as {leads.length} conexões automaticamente
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Carregando...</p>}
      {error   && <p style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>{error}</p>}

      {!loading && !error && leads.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <p style={{ fontSize: 13 }}>Nenhum lead nesta fila agora.</p>
        </div>
      )}

      {/* Leads agrupados por empresa */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {groups.map((group, gi) => (
          <div key={group.empresa} style={{ marginTop: gi === 0 ? 0 : 28 }}>

            {/* Cabeçalho da empresa */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 12, paddingBottom: 10,
              borderBottom: '1px solid var(--border)',
            }}>
              <CompanyLogo site={group.site} name={group.empresa} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                  {group.empresa}
                </div>
                {(group.setor || group.cidade) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {[group.setor, group.cidade].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                {group.leads.length} {group.leads.length === 1 ? 'decisor' : 'decisores'}
              </div>
            </div>

            {/* Cards dos decisores */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {group.leads.map(lead => (
                <LeadCard
                  key={lead.id_lead}
                  lead={lead}
                  aba={aba}
                  mensagemEditada={mensagensEditadas[lead.id_lead] ?? null}
                  onMensagemEdit={msg => setMensagensEditadas(prev => ({ ...prev, [lead.id_lead]: msg }))}
                  onAcao={action => executarAcao(lead, action)}
                  loading={pendingId === lead.id_lead || lotando}
                  extensaoOk={extensaoOk}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {leads.length > 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, marginTop: 32 }}>
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

function LeadCard({ lead, aba, mensagemEditada, onMensagemEdit, onAcao, loading, extensaoOk }: {
  lead:            LeadMaster
  aba:             Aba
  mensagemEditada: string | null
  onMensagemEdit:  (m: string) => void
  onAcao:          (a: 'enviar' | 'pular' | 'descartar') => void
  loading:         boolean
  extensaoOk:      boolean
}) {
  const mensagem    = mensagemEditada ?? (lead[CAMPO_POR_ABA[aba]] as string) ?? ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const linkedinUrl = aba === 'conexoes'
    ? lead.linkedin_decisor
    : (lead.link_conversa_linkedin || lead.linkedin_decisor)

  const semLinkedin = !linkedinUrl

  return (
    <div className="card" style={{
      opacity: loading ? 0.5 : 1,
      pointerEvents: loading ? 'none' : 'auto',
      transition: 'opacity 0.15s',
      borderLeft: semLinkedin ? '3px solid var(--red)' : undefined,
    }}>
      {/* Alerta sem LinkedIn */}
      {semLinkedin && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', marginBottom: 12, borderRadius: 6,
          background: 'rgba(220,80,80,0.1)', fontSize: 11, color: 'var(--red)',
        }}>
          <span>Sem perfil LinkedIn — envio automático indisponível</span>
          <button
            onClick={() => onAcao('descartar')}
            disabled={loading}
            style={{
              background: 'var(--red)', border: 'none', cursor: 'pointer',
              color: '#fff', fontSize: 11, fontWeight: 700,
              padding: '3px 8px', borderRadius: 4,
            }}
          >
            Descartar
          </button>
        </div>
      )}

      {/* Cabeçalho do decisor */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 15 }}>
            {lead.nome_decisor || '—'}
          </div>
          {lead.cargo_decisor && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {lead.cargo_decisor}
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

      {/* Textarea de mensagem */}
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
        {!semLinkedin && (
          <button className="btn-primary" onClick={() => onAcao('enviar')} disabled={loading}>
            {extensaoOk ? 'Enviar' : 'Marcar enviado'}
          </button>
        )}
        <button className="btn-secondary" onClick={() => onAcao('pular')} disabled={loading}>
          Pular
        </button>
        {!semLinkedin && (
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
        )}
      </div>
    </div>
  )
}
