import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'
import { getCanonicalMemberEmail } from '@/lib/members.config'

export const dynamic = 'force-dynamic'

const TAB = 'Leads_Master'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const email    = session.user.email
  const emailLow = getCanonicalMemberEmail(email)
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  let rows: string[][] = []
  try {
    const res = await withRetry(() =>
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:R` }),
    )
    rows = (res.data.values ?? []) as string[][]
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }

  const header = rows[0] ?? []
  const data   = rows.slice(1).filter(r => r[0])

  const minhas = data.filter(r => (r[15] ?? '').toLowerCase().trim() === emailLow)
  const outras  = data.filter(r => (r[15] ?? '').toLowerCase().trim() !== emailLow)

  const statusCount: Record<string, number> = {}
  for (const r of data) {
    const s = r[17] ?? '?'
    statusCount[s] = (statusCount[s] ?? 0) + 1
  }

  return Response.json({
    session_email:    email,
    canonical_email:  emailLow,
    total_rows:       data.length,
    minhas_rows:      minhas.length,
    outras_rows:      outras.length,
    status_counts:    statusCount,
    minhas_leads: minhas.map(r => ({
      id:       r[0],
      empresa:  r[1],
      decisor:  r[8],
      membro:   r[15],
      status:   r[17],
      data_imp: r[14],
    })),
    outros_membros: [...new Set(outras.map(r => (r[15] ?? '').toLowerCase().trim()))],
  })
}
