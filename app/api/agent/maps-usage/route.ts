import { auth } from '@/lib/auth'
import { getMonthlyUsage } from '@/lib/agent/maps-usage-tracker'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const usage = await getMonthlyUsage()
  return Response.json(usage)
}
