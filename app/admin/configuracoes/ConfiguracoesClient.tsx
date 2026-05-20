'use client'

import { useState, useEffect } from 'react'

type SaveState = 'idle' | 'saving' | 'ok' | 'erro'

export default function ConfiguracoesClient() {
  const [link, setLink]         = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading]   = useState(true)
  const [state, setState]       = useState<SaveState>('idle')

  useEffect(() => {
    fetch('/api/admin/configuracoes')
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        const val = data.link_apresentacao ?? ''
        setLink(val)
        setOriginal(val)
      })
      .finally(() => setLoading(false))
  }, [])

  const dirty = link !== original

  async function salvar() {
    setState('saving')
    try {
      const res = await fetch('/api/admin/configuracoes', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ link_apresentacao: link }),
      })
      if (!res.ok) throw new Error()
      setOriginal(link)
      setState('ok')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('erro')
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif' }}>
          Configurações
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          Configurações globais da ferramenta de prospecção.
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Carregando…</p>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', display: 'block', marginBottom: 6 }}>
              Link da Apresentação Institucional
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Usado no template <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>followup_3</code> como <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>{'{link_apresentacao}'}</code>.
              Deixe vazio para bloquear o envio do followup_3 até ser configurado.
            </p>
            <input
              className="input"
              type="url"
              placeholder="https://drive.google.com/..."
              value={link}
              onChange={e => { setLink(e.target.value); setState('idle') }}
              style={{ fontSize: 13, padding: '9px 12px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn-primary"
              onClick={salvar}
              disabled={state === 'saving' || !dirty}
              style={{
                opacity:    (!dirty && state === 'idle') ? 0.35 : 1,
                background: state === 'ok'   ? 'var(--green)'
                          : state === 'erro' ? 'var(--red)'
                          : undefined,
              }}
            >
              {state === 'saving' ? 'Salvando…' : state === 'ok' ? 'Salvo ✓' : state === 'erro' ? 'Erro ao salvar' : 'Salvar'}
            </button>

            {!link && (
              <span style={{ fontSize: 12, color: 'var(--gold)' }}>
                ⚠ followup_3 bloqueado enquanto vazio
              </span>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
