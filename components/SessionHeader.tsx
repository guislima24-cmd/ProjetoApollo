'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function NavLinkInner({
  href, children, exact,
}: { href: string; children: React.ReactNode; exact?: boolean }) {
  const pathname  = usePathname()
  const params    = useSearchParams()
  const fullPath  = pathname + (params.toString() ? `?${params.toString()}` : '')
  const active    = exact ? fullPath === href : fullPath.startsWith(href)

  return (
    <Link
      href={href}
      style={{
        color:        active ? 'var(--cream)' : 'var(--text-secondary)',
        background:   active ? 'rgba(49,112,57,0.15)' : 'transparent',
        fontSize:     13,
        fontFamily:   'DM Sans, sans-serif',
        fontWeight:   active ? 600 : 400,
        textDecoration: 'none',
        padding:      '5px 11px',
        borderRadius: 6,
        transition:   'all 0.15s',
      }}
    >
      {children}
    </Link>
  )
}

function NavLink(props: { href: string; children: React.ReactNode; exact?: boolean }) {
  return (
    <Suspense fallback={
      <Link href={props.href} style={{ color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'DM Sans', textDecoration: 'none', padding: '5px 11px' }}>
        {props.children}
      </Link>
    }>
      <NavLinkInner {...props} />
    </Suspense>
  )
}

function PlanilhaButton({ memberTab }: { memberTab: string }) {
  const openSheet = async () => {
    try {
      const res  = await fetch('/api/sheets/link')
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank')
    } catch {
      // fallback sem gid
      const id = ''
      window.open(`https://docs.google.com/spreadsheets/d/${id}/edit`, '_blank')
    }
  }

  return (
    <button
      onClick={openSheet}
      title={`Abrir aba: ${memberTab}`}
      style={{
        color:        'var(--text-secondary)',
        background:   'transparent',
        fontSize:     13,
        fontFamily:   'DM Sans, sans-serif',
        fontWeight:   400,
        border:       'none',
        padding:      '5px 11px',
        borderRadius: 6,
        cursor:       'pointer',
        transition:   'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--cream)'; e.currentTarget.style.background = 'rgba(49,112,57,0.15)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
    >
      Planilha ↗
    </button>
  )
}

export default function SessionHeader() {
  const { data: session } = useSession()

  return (
    <header style={{
      borderBottom: '1px solid var(--border)',
      padding:      '0 24px',
      height:       52,
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      background:   'var(--bg)',
      position:     'sticky',
      top:          0,
      zIndex:       50,
    }}>
      {/* Nav esquerda */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Link href="/gerador?tab=manual" style={{
          fontFamily:     'Syne, sans-serif',
          fontWeight:     800,
          fontSize:       15,
          color:          'var(--green-primary)',
          textDecoration: 'none',
          display:        'flex',
          alignItems:     'center',
          gap:            6,
        }}>
          <span>✦</span> ProspectAI
        </Link>

        {session && (
          <div style={{ display: 'flex', gap: 2 }}>
            <NavLink href="/gerador?tab=manual" exact>Gerador</NavLink>
            <NavLink href="/gerador?tab=bulk"   exact>Em Massa</NavLink>
            <NavLink href="/prospectar">Prospectar</NavLink>
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/descoberta">Descobrir Leads</NavLink>
            <NavLink href="/qualificar">Qualificar Lead</NavLink>
            <NavLink href="/agente">Agente</NavLink>
            <NavLink href="/instalar">↓ Extensão</NavLink>
            <PlanilhaButton memberTab={session.user?.memberTab ?? ''} />
          </div>
        )}
      </nav>

      {/* Nav direita */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {session ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {session.user?.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  width={26}
                  height={26}
                  style={{ borderRadius: '50%', border: '2px solid var(--green-primary)' }}
                />
              )}
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {session.user?.memberTab}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              style={{
                background:   'transparent',
                border:       '1px solid var(--border)',
                borderRadius: 7,
                color:        'var(--text-muted)',
                padding:      '5px 12px',
                fontSize:     12,
                cursor:       'pointer',
                fontFamily:   'Syne, sans-serif',
                fontWeight:   600,
              }}
            >
              Sair
            </button>
          </>
        ) : (
          <Link
            href="/login"
            style={{
              background:     'var(--green-primary)',
              color:          'var(--cream)',
              padding:        '6px 14px',
              borderRadius:   7,
              fontSize:       13,
              fontFamily:     'Syne, sans-serif',
              fontWeight:     700,
              textDecoration: 'none',
            }}
          >
            Entrar
          </Link>
        )}
      </div>
    </header>
  )
}
