import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/members.config'
import { parseCsv, mapApolloRow } from '@/lib/csv-parser'
import { getMasterSnapshot, isDuplicate, distributeLeads } from '@/lib/sheets/distribution'

export const dynamic = 'force-dynamic'

async function guardAdmin() {
  const session = await auth()
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return Response.json({ error: 'Acesso negado' }, { status: 403 })
  }
  return null
}

export async function POST(req: NextRequest) {
  const denied = await guardAdmin()
  if (denied) return denied

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: 'Envie um multipart/form-data com campo "file"' }, { status: 400 })
  }

  const action = (formData.get('action') as string | null) ?? 'preview'
  const file   = formData.get('file') as File | null

  if (!file) return Response.json({ error: 'Campo "file" obrigatório' }, { status: 400 })

  const text = await file.text()
  const raw  = parseCsv(text)

  if (!raw.length) {
    return Response.json({ error: 'CSV vazio ou inválido' }, { status: 400 })
  }

  // mapApolloRow lida com aliases flexíveis — filtra só por empresa presente
  const rows = raw.map(mapApolloRow).filter(r => r.nome_empresa)
  const snapshot = await getMasterSnapshot()

  const novos      = rows.filter(r => !isDuplicate(r, snapshot))
  const duplicados = rows.length - novos.length

  if (action === 'preview') {
    return Response.json({
      total:      rows.length,
      novos:      novos.length,
      duplicados,
      preview:    novos.slice(0, 10).map(r => ({
        nome_empresa:  r.nome_empresa,
        nome_decisor:  r.nome_decisor,
        cargo_decisor: r.cargo_decisor,
        cidade:        r.cidade,
        setor:         r.setor,
      })),
    })
  }

  if (action === 'distribute') {
    try {
      const summary = await distributeLeads(rows, snapshot)
      return Response.json({ ok: true, summary })
    } catch (err) {
      console.error('[import-apollo] distributeLeads error:', err)
      return Response.json({ error: String(err) }, { status: 500 })
    }
  }

  return Response.json({ error: 'action inválida (use preview ou distribute)' }, { status: 400 })
}
