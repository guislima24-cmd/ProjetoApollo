import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isAdminEmail } from '@/lib/members.config'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')
  if (!isAdminEmail(session.user.email)) redirect('/dashboard')

  return <DashboardClient />
}
