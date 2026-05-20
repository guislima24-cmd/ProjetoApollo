import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isAdminEmail } from '@/lib/members.config'
import ConfiguracoesClient from './ConfiguracoesClient'

export const dynamic = 'force-dynamic'

export default async function AdminConfiguracoesPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  if (!isAdminEmail(session.user.email)) redirect('/dashboard')

  return <ConfiguracoesClient />
}
