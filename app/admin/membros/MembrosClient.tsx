'use client'

import { useState, useEffect } from 'react'
import { MEMBERS_DISTRIBUTION } from '@/lib/members.config'

interface Profile {
  email:    string
  nome:     string
  telefone: string
}

type SaveState = 'idle' | 'saving' | 'ok' | 'erro'

export default function MembrosClient() {
  const [profiles, setProfiles]     = useState<Record<string, Profile>>({})
  const [edits, setEdits]           = useState<Record<string, Profile>>({})
  const [saveState, setSaveState]   = useState<Record<string, SaveState>>({})
  const [saveError, setSaveError]   = useState<Record<string, string>>({})
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/admin/membros')
      .then(r => r.json())
      .then((data: Profile[]) => {
        const map: Record<string, Profile> = {}
        for (const p of data) map[p.email] = p
        setProfiles(map)
      })
      .finally(() => setLoading(false))
  }, [])

  function getEdit(email: string): Profile {
    return edits[email] ?? profiles[email] ?? { email, nome: '', telefone: '' }
  }

  function setField(email: string, field: 'nome' | 'telefone', value: string) {
    setEdits(prev => ({
      ...prev,
      [email]: { ...getEdit(email), [field]: value },
    }))
    setSaveState(prev => ({ ...prev, [email]: 'idle' }))
    setSaveError(prev => { const n = { ...prev }; delete n[email]; return n })
  }

  async function salvar(email: string) {
    const profile = getEdit(email)
    setSaveState(prev => ({ ...prev, [email]: 'saving' }))
    setSaveError(prev => { const n = { ...prev }; delete n[email]; return n })
    try {
      const res = await fetch('/api/admin/membros', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(profile),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setProfiles(prev => ({ ...prev, [email]: profile }))
      setEdits(prev => { const n = { ...prev }; delete n[email]; return n })
      setSaveState(prev => ({ ...prev, [email]: 'ok' }))
      setTimeout(() => setSaveState(prev => ({ ...prev, [email]: 'idle' })), 2000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      setSaveError(prev => ({ ...prev, [email]: msg }))
      setSaveState(prev => ({ ...prev, [email]: 'erro' }))
      setTimeout(() => setSaveState(prev => ({ ...prev, [email]: 'idle' })), 4000)
    }
  }

  const members = MEMBERS_DISTRIBUTION

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
          Perfis dos Membros
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          Nome e telefone usados para personalizar os templates de mensagem.
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Carregando…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {members.map(member => {
            const edit     = getEdit(member.email)
            const state    = saveState[member.email] ?? 'idle'
            const dirty    = edits[member.email] !== undefined
            const incompleto = !edit.nome || !edit.telefone
            const errMsg   = saveError[member.email]

            return (
              <div key={member.email}>
                <div className="card" style={{
                  display:    'grid',
                  gridTemplateColumns: '1fr 1fr 1fr auto',
                  gap:        12,
                  alignItems: 'center',
                  borderLeft: incompleto ? '3px solid var(--gold)' : undefined,
                }}>
                  {/* Membro */}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{member.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{member.email}</div>
                  </div>

                  {/* Nome */}
                  <input
                    className="input"
                    placeholder="Nome completo"
                    value={edit.nome}
                    onChange={e => setField(member.email, 'nome', e.target.value)}
                    style={{ fontSize: 13, padding: '7px 10px' }}
                  />

                  {/* Telefone — aceita qualquer formato */}
                  <input
                    className="input"
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={edit.telefone}
                    onChange={e => setField(member.email, 'telefone', e.target.value)}
                    style={{ fontSize: 13, padding: '7px 10px' }}
                  />

                  {/* Botão */}
                  <button
                    onClick={() => salvar(member.email)}
                    disabled={state === 'saving' || !dirty}
                    className={state === 'ok' ? '' : 'btn-primary'}
                    style={{
                      whiteSpace: 'nowrap',
                      fontSize:   13,
                      padding:    '7px 14px',
                      opacity:    (!dirty && state === 'idle') ? 0.35 : 1,
                      background: state === 'ok'   ? 'var(--green)'
                                : state === 'erro' ? 'var(--red)'
                                : undefined,
                    }}
                  >
                    {state === 'saving' ? '…' : state === 'ok' ? 'Salvo ✓' : state === 'erro' ? 'Erro' : 'Salvar'}
                  </button>
                </div>

                {errMsg && (
                  <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, paddingLeft: 4 }}>
                    {errMsg}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
