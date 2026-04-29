'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const ERROR_MESSAGES: Record<string, string> = {
  EmailNaoAutorizado: 'Este email não está cadastrado no time comercial.',
  OAuthSignin: 'Erro ao iniciar login com Google. Tente novamente.',
  OAuthCallback: 'Erro na autenticação com Google. Tente novamente.',
  Default: 'Ocorreu um erro. Tente novamente.',
}

function LoginContent() {
  const params = useSearchParams()
  const error = params.get('error')
  const email = params.get('email')
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default) : null

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'var(--bg)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 32,
      }}>
        {/* Logo / header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'var(--green-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 26,
          }}>
            ✦
          </div>
          <h1 style={{ fontSize: 28, fontFamily: 'Syne, sans-serif', marginBottom: 6 }}>
            ProspectAI
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            UFABC Júnior · Time Comercial
          </p>
        </div>

        {/* Card */}
        <div style={{
          width: '100%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              Entre com sua conta Google institucional para acessar o painel.
            </p>
          </div>

          {/* Erro de autenticação */}
          {errorMessage && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#f87171',
              lineHeight: 1.5,
            }}>
              {errorMessage}
              {email && (
                <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: 12 }}>
                  Email tentado: {email}
                </div>
              )}
            </div>
          )}

          {/* Botão Google */}
          <button
            onClick={() => signIn('google', { callbackUrl: '/gerador' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              width: '100%',
              padding: '13px 20px',
              background: '#fff',
              color: '#1f1f1f',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <GoogleIcon />
            Entrar com Google
          </button>

          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Apenas contas <code style={{ color: 'var(--cream)' }}>@ufabcjr.com.br</code> têm acesso.
          </p>
        </div>
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
