'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LogoutButton() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(false)

  async function sair() {
    setCarregando(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } finally {
      setCarregando(false)
    }
  }

  return (
    <button
      onClick={sair}
      disabled={carregando}
      style={{
        background: 'transparent',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
        padding: '4px 12px',
        borderRadius: 6,
        fontSize: 12,
        cursor: carregando ? 'not-allowed' : 'pointer',
      }}
    >
      {carregando ? 'Saindo...' : 'Sair'}
    </button>
  )
}
