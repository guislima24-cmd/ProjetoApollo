import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isAdminEmail } from '@/lib/members.config'
import MembrosClient from './MembrosClient'

export const dynamic = 'force-dynamic'

export default async function AdminMembrosPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  if (!isAdminEmail(session.user.email)) redirect('/dashboard')

  return <MembrosClient />
}
