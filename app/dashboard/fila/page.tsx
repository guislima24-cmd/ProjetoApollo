import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FilaClient from './FilaClient'

export const dynamic = 'force-dynamic'

export default async function FilaPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/login')

  const nome = session.user.name?.split(' ')[0] ?? session.user.email.split('@')[0]

  return <FilaClient nomeUsuario={nome} email={session.user.email} />
}
