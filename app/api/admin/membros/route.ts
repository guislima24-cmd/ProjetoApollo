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
    .from('member_profiles')
    .select('email, nome, telefone')
    .order('email')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}

export async function PATCH(req: NextRequest) {
  const err = await guardAdmin()
  if (err) return err

  const { email, nome, telefone } = await req.json() as {
    email:    string
    nome:     string
    telefone: string
  }

  if (!email) return Response.json({ error: 'email é obrigatório' }, { status: 400 })

  const { error } = await supabase()
    .from('member_profiles')
    .upsert(
      { email: email.toLowerCase().trim(), nome: nome ?? '', telefone: telefone ?? '', updated_at: new Date().toISOString() },
      { onConflict: 'email' },
    )

  if (error) {
    console.error('[PATCH /api/admin/membros] Supabase error:', JSON.stringify(error, null, 2))
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ ok: true })
}
