'use client'

import { FormEvent, useState } from 'react'
import { MEMBER_TABS } from '@/lib/members'

const USERNAMES = [
  'anna',
  'daniel',
  'duda',
  'felipe',
  'gui-lima',
  'gui-midolli',
  'gustavo',
  'larissa',
  'leo',
  'leticia',
  'tiago',
] as const

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  padding: '10px 12px',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
}

export default function HashClient() {
  const [username, setUsername] = useState<string>('gui-lima')
  const [senha, setSenha] = useState('')
  const [linhas, setLinhas] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  async function gerar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    try {
      const res = await fetch('/api/auth/hash-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, senha }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.detalhe ?? data.error ?? 'Falha ao gerar hash')
        return
      }
      // Substitui se já existir entry para esse username
      setLinhas((prev) => {
        const semDuplicata = prev.filter((l) => !l.startsWith(`${username}:`))
        return [...semDuplicata, data.linha]
      })
      setSenha('')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setCarregando(false)
    }
  }

  const concatenado = linhas.join('|')

  async function copiar() {
    if (!concatenado) return
    await navigator.clipboard.writeText(concatenado)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const jaGerados = new Set(linhas.map((l) => l.split(':')[0]))
  const faltando = USERNAMES.filter((u) => !jaGerados.has(u))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <form
        onSubmit={gerar}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          Username
          <select
            style={inputStyle}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          >
            {USERNAMES.map((u, i) => (
              <option key={u} value={u}>
                {u} → aba {MEMBER_TABS[i]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          Senha
          <input
            style={inputStyle}
            type="text"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="digite a senha que o membro vai usar"
            required
          />
        </label>

        {erro && (
          <div
            style={{
              color: 'var(--red)',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={carregando || !senha}
          style={{
            padding: '10px 16px',
            background: 'var(--accent)',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: carregando || !senha ? 'not-allowed' : 'pointer',
            opacity: carregando || !senha ? 0.7 : 1,
          }}
        >
          {carregando ? 'Gerando...' : 'Gerar hash'}
        </button>
      </form>

      {linhas.length > 0 && (
        <section
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 18 }}>
              Linhas geradas ({linhas.length}/{USERNAMES.length})
            </h2>
            <button
              onClick={copiar}
              style={{
                background: copiado ? 'var(--green)' : 'transparent',
                color: copiado ? '#0a0a0a' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: copiado ? 600 : 400,
              }}
            >
              {copiado ? '✓ Copiado' : 'Copiar MEMBER_CREDENTIALS'}
            </button>
          </div>

          <pre
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
            }}
          >
            {concatenado}
          </pre>

          {faltando.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Faltam: <code>{faltando.join(', ')}</code>
            </p>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Cole o texto acima como valor da env <code>MEMBER_CREDENTIALS</code> no Vercel.
            Depois remova a env <code>ENABLE_HASH_SETUP</code> e faça um novo deploy.
          </p>
        </section>
      )}
    </div>
  )
}
