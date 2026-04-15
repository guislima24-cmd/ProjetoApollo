import HashClient from './HashClient'

/**
 * Página de setup — gera as linhas de MEMBER_CREDENTIALS sem precisar
 * rodar nada localmente. Só funciona se `ENABLE_HASH_SETUP=true` estiver
 * setada na env (a rota `/api/auth/hash-password` valida isso no servidor).
 */

export default function SetupHashPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ fontSize: 28 }}>Setup — gerar hashes</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Use esta página para gerar cada linha do <code>MEMBER_CREDENTIALS</code>.
          <br />
          Para funcionar: <code>JWT_SECRET</code> e <code>ENABLE_HASH_SETUP=true</code>{' '}
          precisam estar setados no Vercel. <strong>Remova a env{' '}
          <code>ENABLE_HASH_SETUP</code> assim que terminar a configuração.</strong>
        </p>
      </header>

      <HashClient />
    </main>
  )
}
