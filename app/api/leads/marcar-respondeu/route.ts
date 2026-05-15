import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { updateLeadStatus } from '@/lib/sheets/lead-status'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'

export const dynamic = 'force-dynamic'

const TAB = 'Leads_Master'

function normalize(s: string) {
  return s.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { nome_decisor } = await req.json() as { nome_decisor: string }
  if (!nome_decisor?.trim()) {
    return Response.json({ error: 'nome_decisor obrigatório' }, { status: 400 })
  }

  const spreadsheetId = getSpreadsheetId()
  const sheets        = getSheets()
  const email         = session.user.email.toLowerCase().trim()

  const res  = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:R` }),
  )
  const rows = (res.data.values ?? []) as string[][]
  const normNome = normalize(nome_decisor)

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) continue
    // Only match leads assigned to this member
    const rowEmail = (row[15] ?? '').toLowerCase().trim()
    if (rowEmail !== email) continue

    const rowNome  = normalize(row[8] ?? '')
    const rowStatus = row[17] ?? ''

    if (rowNome !== normNome) continue
    if (['respondeu', 'descartado'].includes(rowStatus)) continue

    await updateLeadStatus(row[0], 'respondeu', email)
    return Response.json({ ok: true, lead_id: row[0], nome: row[8] })
  }

  return Response.json({ ok: false, message: 'Lead não encontrado ou já respondeu' })
}
