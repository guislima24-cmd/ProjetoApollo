import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/members.config'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function guardAdmin() {
  const session = await auth()
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return Response.json({ error: 'Acesso negado' }, { status: 403 })
  }
  return null
}

export async function GET() {
  const err = await guardAdmin()
  if (err) return err

  const { data, error } = await supabase()
    .from('configuracoes')
    .select('chave, valor')

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const config: Record<string, string> = {}
  for (const row of data ?? []) config[row.chave as string] = row.valor as string
  return Response.json(config)
}

export async function PATCH(req: NextRequest) {
  const err = await guardAdmin()
  if (err) return err

  const body = await req.json() as Record<string, string>

  const upserts = Object.entries(body).map(([chave, valor]) => ({
    chave,
    valor: valor ?? '',
    updated_at: new Date().toISOString(),
  }))

  if (!upserts.length) return Response.json({ ok: true })

  const { error } = await supabase()
    .from('configuracoes')
    .upsert(upserts, { onConflict: 'chave' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
