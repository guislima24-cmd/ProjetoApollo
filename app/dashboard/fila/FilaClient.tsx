'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { FilaCard, FilaData } from '@/lib/types/fila'

type Aba = 'conexoes' | 'followups'

interface CompanyGroup {
  empresa:          string
  setor:            string
  cidade:           string
  website:          string
  linkedin_empresa: string
  potencial:        string
  card:             FilaCard   // cascade: sempre 1 card por empresa
}

const LABEL_ABA: Record<Aba, string> = {
  conexoes:  'Conexões',
  followups: 'Follow-ups',
}

declare const chrome: any

function groupByEmpresa(cards: FilaCard[]): CompanyGroup[] {
  const map = new Map<string, CompanyGroup>()
  for (const card of cards) {
    const key = card.empresa || '—'
    if (!map.has(key)) {
      map.set(key, {
        empresa:          card.empresa,
        setor:            card.setor,
        cidade:           card.cidade,
        website:          card.website,
        linkedin_empresa: card.linkedin_empresa,
        potencial:        card.potencial,
        card,
      })
    }
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
  const [aba, setAba]               = useState<Aba>('conexoes')
  const [fila, setFila]             = useState<FilaData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [extensaoOk, setExtensaoOk] = useState(false)
  const [mensagensRenderizadas, setMensagensRenderizadas] = useState<Record<string, string>>({})
  const [mensagensEditadas, setMensagensEditadas]         = useState<Record<string, string>>({})
  const [mensagensCarregando, setMensagensCarregando]     = useState<Record<string, boolean>>({})
  const [pendingId, setPendingId]   = useState<string | null>(null)
  const [avisoExtensao, setAvisoExtensao] = useState<string | null>(null)
  const [lotando, setLotando]             = useState(false)
  const [loteProgresso, setLoteProgresso] = useState<{ feitos: number; total: number } | null>(null)
  const [modalLote, setModalLote]         = useState<{ elegiveis: FilaCard[]; pulados: FilaCard[] } | null>(null)
  const [relatorioLote, setRelatorioLote] = useState<{ enviadas: number; puladas: number } | null>(null)

  const extensionId = 'blpnncjjlegmhcljfahmljfbofhepmab'
  const LIMITE_LOTE = 50

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    let data: FilaData | null = null
    try {
      const res = await fetch('/api/leads/fila')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json() as FilaData
      setFila(data)
    } catch {
      setError('Erro ao carregar fila.')
    } finally {
      setLoading(false)
    }

    if (!data) return

    // Pré-renderiza mensagens apenas para cards com sysId (follow-ups existentes)
    const allCards = [...(data.conexoes ?? []), ...(data.followups ?? [])]
    const cardsComSysId = allCards.filter(c => c.sysId !== '')
    if (!cardsComSysId.length) return

    const ids = cardsComSysId.map(c => c.id)
    setMensagensCarregando(prev => ({ ...prev, ...Object.fromEntries(ids.map(id => [id, true])) }))

    const results = await Promise.allSettled(
      cardsComSysId.map(async card => {
        try {
          const r = await fetch(`/api/leads/${card.sysId}/pre-send`)
          const d = await r.json() as { ok: boolean; mensagem?: string }
          return { id: card.id, mensagem: d.ok && d.mensagem ? d.mensagem : '' }
        } catch {
          return { id: card.id, mensagem: '' }
        }
      })
    )

    const novas: Record<string, string> = {}
    for (const r of results) {
      if (r.status === 'fulfilled') novas[r.value.id] = r.value.mensagem
    }
    setMensagensRenderizadas(prev => ({ ...prev, ...novas }))
    setMensagensCarregando(prev => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
  }, [])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage || !extensionId) return
    try {
      chrome.runtime.sendMessage(extensionId, { type: 'LI_PING' }, (resp: any) => {
        void chrome.runtime.lastError
        setExtensaoOk(!!resp?.ok)
      })
    } catch { /* Extension not installed */ }
  }, [extensionId])

  const cards = fila ? (fila[aba] ?? []) : []

  useEffect(() => {
    if (!cards.length) return
    const card = cards[0]
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === 'e' || e.key === 'E') executarAcao(card, 'enviar')
      if (e.key === 'Escape') executarAcao(card, 'pular')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fila, aba, mensagensEditadas])

  async function executarAcao(card: FilaCard, action: 'enviar' | 'pular' | 'descartar') {
    if (pendingId) return
    setPendingId(card.id)

    // Cards novos (sem sysId): apenas extensão, sem tracking até Fase 4
    if (card.sysId === '' && action === 'enviar') {
      if (!card.decisorUrl) {
        setAvisoExtensao('Este decisor não tem URL do LinkedIn — não é possível enviar via extensão.')
        setPendingId(null)
        return
      }
      if (extensaoOk) {
        const mensagem = mensagensEditadas[card.id] ?? ''
        chrome.runtime.sendMessage(extensionId, {
          type:         'LI_SEND_REQUEST',
          action:       'enviar_conexao',
          lead_id:      card.id,
          mensagem,
          linkedin_url: card.decisorUrl,
        }, async (resp: any) => {
          void chrome.runtime.lastError
          if (resp?.ok) {
            try {
              await registrarConexaoEnviada(card)
              await carregar()
              setAvisoExtensao(null)
            } catch {
              setAvisoExtensao('Conexão enviada, mas erro ao registrar — atualize a página.')
            }
          } else {
            const errMsg = resp?.error ?? 'Erro na extensão.'
            if (errMsg.includes('LIMITE_SEMANAL')) {
              setAvisoExtensao('⚠ Limite semanal de convites do LinkedIn atingido.')
            } else if (errMsg.includes('CAPTCHA')) {
              setAvisoExtensao('⚠ CAPTCHA detectado no LinkedIn. Resolva manualmente.')
            } else {
              setAvisoExtensao(errMsg)
            }
          }
          setPendingId(null)
        })
      } else {
        setAvisoExtensao('Extensão offline. Use "Marcar enviado" manualmente e confira a Fase 4.')
        setPendingId(null)
      }
      return
    }

    // Cards sem sysId: pular/descartar ainda não rastreados (Fase 4)
    if (card.sysId === '' && (action === 'pular' || action === 'descartar')) {
      setAvisoExtensao(`Ação "${action}" para novos cards será implementada na Fase 4.`)
      setPendingId(null)
      return
    }

    // Cards com sysId (follow-ups existentes): fluxo normal com verificação
    if (action === 'enviar') {
      try {
        const checkRes = await fetch(`/api/leads/${card.sysId}/pre-send`)
        if (!checkRes.ok) {
          const d = await checkRes.json() as { motivo?: string; error?: string }
          setAvisoExtensao(d.motivo ?? d.error ?? 'Este lead não pode receber mensagens agora.')
          setPendingId(null)
          return
        }
      } catch {
        setAvisoExtensao('Erro ao verificar status do lead.')
        setPendingId(null)
        return
      }
    }

    const mensagem  = mensagensEditadas[card.id] ?? mensagensRenderizadas[card.id] ?? ''
    const linkedinUrl = card.decisorUrl

    if (action === 'enviar' && extensaoOk) {
      if (!linkedinUrl) {
        setAvisoExtensao('Este lead não tem LinkedIn cadastrado — não é possível enviar via extensão.')
        setPendingId(null)
        return
      }
      chrome.runtime.sendMessage(extensionId, {
        type:         'LI_SEND_REQUEST',
        action:       'enviar_conexao',
        lead_id:      card.sysId,
        mensagem,
        linkedin_url: linkedinUrl,
      }, async (resp: any) => {
        void chrome.runtime.lastError
        if (resp?.ok) {
          setAvisoExtensao(null)
          await confirmarEnvio(card, action)
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

    await confirmarEnvio(card, action)
  }

  async function registrarConexaoEnviada(card: FilaCard): Promise<void> {
    await fetch('/api/leads/send-connection', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csvRowIndex:   card.csvRowIndex,
        decisorIdx:    card.decisorIdx,
        decisorNome:   card.decisorNome,
        decisorUrl:    card.decisorUrl,
        empresa:       card.empresa,
        setor:         card.setor,
        website:       card.website,
        templatePitch: card.templatePitch,
      }),
    })
  }

  function construirLote(): { elegiveis: FilaCard[]; pulados: FilaCard[] } {
    const lista = [...(fila?.conexoes ?? [])]
    const elegiveis: FilaCard[] = []
    const pulados: FilaCard[] = []
    for (const card of lista) {
      const mensagem = mensagensEditadas[card.id] ?? mensagensRenderizadas[card.id] ?? ''
      const temLiteral = mensagem.includes('{lead}')
      if (!card.decisorUrl || temLiteral) {
        pulados.push(card)
      } else if (elegiveis.length < LIMITE_LOTE) {
        elegiveis.push(card)
      } else {
        pulados.push(card)
      }
    }
    return { elegiveis, pulados }
  }

  function abrirModalLote() {
    if (lotando || !extensaoOk || !fila) return
    const lote = construirLote()
    if (lote.elegiveis.length === 0) {
      setAvisoExtensao('Nenhum card elegível para envio (sem LinkedIn ou com {lead} não substituído).')
      return
    }
    setModalLote(lote)
  }

  async function enviarLote(lista: FilaCard[]) {
    if (lotando || !extensaoOk) return
    if (!lista.length) return
    setLotando(true)
    setAvisoExtensao(null)
    const erros: string[] = []
    const semLinkedin: string[] = []

    for (let i = 0; i < lista.length; i++) {
      const card = lista[i]
      setLoteProgresso({ feitos: i, total: lista.length })

      if (!card.decisorUrl) {
        semLinkedin.push(card.decisorNome || card.empresa)
        continue
      }

      // Cards com sysId fazem pre-send check; novos cards, pular checagem
      let mensagem = mensagensEditadas[card.id] ?? mensagensRenderizadas[card.id] ?? ''
      if (card.sysId !== '') {
        try {
          const checkRes  = await fetch(`/api/leads/${card.sysId}/pre-send`)
          const checkData = await checkRes.json() as { ok: boolean; mensagem?: string; motivo?: string }
          if (!checkRes.ok) {
            if (checkData.motivo?.includes('respondeu')) continue
            erros.push(`${card.decisorNome || card.empresa}: ${checkData.motivo ?? 'Bloqueado'}`)
            continue
          }
          if (!mensagensEditadas[card.id] && checkData.mensagem) mensagem = checkData.mensagem
        } catch {
          erros.push(`${card.decisorNome || card.empresa}: Erro ao verificar status`)
          continue
        }
      }

      const resultado = await new Promise<{ ok: boolean; error?: string }>(resolve => {
        try {
          chrome.runtime.sendMessage(extensionId, {
            type:         'LI_SEND_REQUEST',
            action:       'enviar_conexao',
            lead_id:      card.sysId || card.id,
            mensagem,
            linkedin_url: card.decisorUrl,
          }, (resp: any) => {
            void chrome.runtime.lastError
            resolve(resp ?? { ok: false, error: 'Sem resposta da extensão' })
          })
        } catch {
          resolve({ ok: false, error: 'Extensão indisponível' })
        }
      })

      if (resultado.ok) {
        if (card.sysId !== '') {
          await fetch('/api/leads/action', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ lead_id: card.sysId, action: 'enviar' }),
          }).catch(() => {})
        } else {
          await registrarConexaoEnviada(card).catch(() => {})
        }
        setMensagensEditadas(prev => { const n = { ...prev }; delete n[card.id]; return n })
      } else {
        const errMsg = resultado.error ?? 'Erro desconhecido'
        if (errMsg.includes('LIMITE_SEMANAL')) {
          setAvisoExtensao('⚠ Limite semanal de convites atingido. Lote interrompido.')
          break
        }
        erros.push(`${card.decisorNome || card.empresa}: ${errMsg}`)
      }

      if (i < lista.length - 1) await new Promise(r => setTimeout(r, 3000))
    }

    await carregar()
    setLotando(false)
    setLoteProgresso(null)
    setModalLote(null)

    const enviadas = lista.length - erros.length - semLinkedin.length
    setRelatorioLote({ enviadas, puladas: erros.length + semLinkedin.length })
  }

  async function confirmarEnvio(card: FilaCard, action: 'enviar' | 'pular' | 'descartar') {
    try {
      await fetch('/api/leads/action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lead_id: card.sysId, action }),
      })
      await carregar()
      setMensagensEditadas(prev => { const n = { ...prev }; delete n[card.id]; return n })
    } catch {
      setError('Erro ao processar ação.')
    } finally {
      setPendingId(null)
    }
  }

  const groups = groupByEmpresa(cards)

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

      {/* Relatório pós-lote */}
      {relatorioLote && (
        <div style={{
          marginBottom: 20, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: 'rgba(74,222,128,0.08)', border: '1px solid var(--green)',
          color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>
            {relatorioLote.enviadas} enviada{relatorioLote.enviadas !== 1 ? 's' : ''} com sucesso
            {relatorioLote.puladas > 0 && ` · ${relatorioLote.puladas} com erro`}
          </span>
          <button
            onClick={() => setRelatorioLote(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', fontSize: 14, lineHeight: 1 }}
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

      {/* Botão Enviar Tudo — só para follow-ups com sysId */}
      {aba === 'conexoes' && extensaoOk && cards.length > 0 && (
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
              onClick={abrirModalLote}
              disabled={lotando || !!pendingId}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Enviar todas as {cards.length} conexões automaticamente
            </button>
          )}
        </div>
      )}

      {/* Conteúdo */}
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Carregando...</p>}
      {error   && <p style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>{error}</p>}

      {!loading && !error && cards.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <p style={{ fontSize: 13 }}>Nenhum lead nesta fila agora.</p>
        </div>
      )}

      {/* Leads agrupados por empresa (1 card por empresa — cascade) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {groups.map((group, gi) => (
          <div key={group.empresa} style={{ marginTop: gi === 0 ? 0 : 28 }}>

            {/* Cabeçalho da empresa */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 12, paddingBottom: 10,
              borderBottom: '1px solid var(--border)',
            }}>
              <CompanyLogo site={group.website} name={group.empresa} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
                  {group.empresa}
                </div>
                {(group.setor || group.cidade) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {[group.setor, group.cidade].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              {/* Badge de potencial */}
              {group.potencial && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                  background: group.potencial === 'alto'
                    ? 'rgba(74,222,128,0.15)' : group.potencial === 'medio'
                    ? 'rgba(250,204,21,0.15)' : 'rgba(148,163,184,0.15)',
                  color: group.potencial === 'alto'
                    ? 'var(--green)' : group.potencial === 'medio'
                    ? 'var(--yellow)' : 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {group.potencial}
                </span>
              )}
              {group.linkedin_empresa && (
                <a
                  href={group.linkedin_empresa}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  LinkedIn ↗
                </a>
              )}
            </div>

            {/* Card do decisor ativo (1 por empresa no cascade) */}
            <LeadCard
              card={group.card}
              aba={aba}
              mensagemRenderizada={mensagensRenderizadas[group.card.id] ?? null}
              mensagemEditada={mensagensEditadas[group.card.id] ?? null}
              carregandoMensagem={!!mensagensCarregando[group.card.id]}
              onMensagemEdit={msg => setMensagensEditadas(prev => ({ ...prev, [group.card.id]: msg }))}
              onAcao={action => executarAcao(group.card, action)}
              loading={pendingId === group.card.id || lotando}
              extensaoOk={extensaoOk}
            />
          </div>
        ))}
      </div>

      {cards.length > 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, marginTop: 32 }}>
          Atalho:{' '}
          <kbd style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>E</kbd>
          {' '}envia ·{' '}
          <kbd style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>Esc</kbd>
          {' '}pula
        </p>
      )}

      {/* Modal confirmação lote */}
      {modalLote && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div className="card" style={{ maxWidth: 480, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cream)', marginBottom: 6, fontFamily: 'Syne, sans-serif' }}>
              Confirmar envio em lote
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Você está prestes a enviar {modalLote.elegiveis.length} conexão{modalLote.elegiveis.length !== 1 ? 'ões' : ''}. Revise a lista antes de confirmar.
            </div>
            {modalLote.pulados.length > 0 && (
              <div style={{
                fontSize: 11, color: 'var(--gold)', marginBottom: 12,
                padding: '6px 10px', borderRadius: 6,
                background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)',
              }}>
                {modalLote.pulados.length} card{modalLote.pulados.length !== 1 ? 's' : ''} excluído{modalLote.pulados.length !== 1 ? 's' : ''} do lote (sem LinkedIn ou {'{lead}'} literal)
              </div>
            )}
            <div style={{ overflowY: 'auto', flex: 1, marginBottom: 16, borderRadius: 6, border: '1px solid var(--border)' }}>
              {modalLote.elegiveis.map((card, i) => (
                <div key={card.id} style={{
                  padding: '8px 12px', fontSize: 12,
                  borderBottom: i < modalLote.elegiveis.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{card.empresa}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{card.decisorNome}</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>#{i + 1}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => enviarLote(modalLote.elegiveis)}
              >
                Confirmar — enviar {modalLote.elegiveis.length}
              </button>
              <button
                className="btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setModalLote(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function LeadCard({ card, aba, mensagemRenderizada, mensagemEditada, carregandoMensagem, onMensagemEdit, onAcao, loading, extensaoOk }: {
  card:                FilaCard
  aba:                 Aba
  mensagemRenderizada: string | null
  mensagemEditada:     string | null
  carregandoMensagem:  boolean
  onMensagemEdit:      (m: string) => void
  onAcao:              (a: 'enviar' | 'pular' | 'descartar') => void
  loading:             boolean
  extensaoOk:          boolean
}) {
  const mensagem    = mensagemEditada ?? mensagemRenderizada ?? ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isNewCard   = card.sysId === ''
  const semLinkedin = !card.decisorUrl

  return (
    <div className="card" style={{
      opacity: loading ? 0.5 : 1,
      pointerEvents: loading ? 'none' : 'auto',
      transition: 'opacity 0.15s',
    }}>

      {/* Badge K suggestion */}
      {card.kSugestao && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', marginBottom: 12, borderRadius: 6,
          background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.3)',
          fontSize: 11,
        }}>
          <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>Sugestão K:</span>
          <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{card.kSugestao}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>confirmar na Fase 5</span>
        </div>
      )}

      {/* Aviso sem LinkedIn (discreto) */}
      {semLinkedin && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ opacity: 0.5 }}>○</span>
          LinkedIn não encontrado
        </div>
      )}

      {/* Cabeçalho do decisor */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 15 }}>
            {card.decisorNome || '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Decisor {card.decisorIdx + 1}
            {card.tentativas > 0 && ` · ${card.tentativas} tentativa${card.tentativas > 1 ? 's' : ''}`}
          </div>
        </div>
        {card.decisorUrl && (
          <a
            href={card.decisorUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--green-primary)', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 16 }}
          >
            Ver LinkedIn ↗
          </a>
        )}
      </div>

      {/* Argumento de abertura (aba conexões) */}
      {aba === 'conexoes' && card.argumento && (
        <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 12, fontStyle: 'italic' }}>
          {card.argumento}
        </div>
      )}

      {/* Observações (aba followups) */}
      {aba === 'followups' && card.observacoes && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {card.observacoes}
        </div>
      )}

      {/* Textarea de mensagem — apenas para follow-ups ou se houver conteúdo */}
      {(!isNewCard || mensagem) && (
        carregandoMensagem ? (
          <div style={{
            height: 100, borderRadius: 8, marginBottom: 14,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: 'var(--text-muted)',
          }}>
            Gerando mensagem…
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={mensagem}
            onChange={e => onMensagemEdit(e.target.value)}
            rows={5}
            className="input"
            style={{ resize: 'vertical', marginBottom: 14 }}
            placeholder={isNewCard ? 'Nota de conexão opcional (máx. 300 caracteres)…' : 'Mensagem…'}
            maxLength={isNewCard ? 300 : undefined}
          />
        )
      )}

      {/* Placeholder para cards novos sem mensagem */}
      {isNewCard && !mensagem && !carregandoMensagem && (
        <textarea
          ref={textareaRef}
          value=""
          onChange={e => onMensagemEdit(e.target.value)}
          rows={3}
          className="input"
          style={{ resize: 'vertical', marginBottom: 14, opacity: 0.6 }}
          placeholder="Nota de conexão opcional (máx. 300 caracteres)…"
          maxLength={300}
        />
      )}

      {/* Aviso {lead} literal não substituído */}
      {mensagem.includes('{lead}') && (
        <div style={{
          fontSize: 11, color: 'var(--gold)', marginBottom: 10,
          padding: '4px 8px', borderRadius: 4,
          background: 'rgba(250,204,21,0.08)',
        }}>
          ⚠ Variável {'{lead}'} não substituída — revise antes de enviar
        </div>
      )}

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
