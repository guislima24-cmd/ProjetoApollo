import type { Metadata } from 'next'
import './globals.css'
import SessionHeader from '@/components/SessionHeader'
import Providers from '@/components/Providers'

export const metadata: Metadata = {
  title: 'ProspectAI — UFABC Júnior',
  description: 'Geração de mensagens de prospecção personalizadas com IA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>
          <SessionHeader />
          {children}
        </Providers>
      </body>
    </html>
  )
}
