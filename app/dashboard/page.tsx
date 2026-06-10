import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/members.config'
import AdminDashboardClient from '@/app/admin/dashboard/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.memberTab) redirect('/login')

  // Admins veem o dashboard analytics
  if (isAdmin(session.user.role)) {
    return <AdminDashboardClient />
  }

  // Membros regulares vão direto para a fila
  redirect('/dashboard/fila')
}
