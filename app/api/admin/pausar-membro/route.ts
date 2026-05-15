import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail, MEMBERS_DISTRIBUTION } from '@/lib/members.config'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'

export const dynamic = 'force-dynamic'

const TAB = 'Leads_Master'

// Statuses that are safe to redistribute (not yet sent)
const REDISTRIB_STATUSES = new Set(['nao_contatado', 'enriquecido'])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return Response.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { email } = await req.json() as { email: string }
  if (!email) return Response.json({ error: 'email obrigatório' }, { status: 400 })

  const emailNorm = email.toLowerCase().trim()
  const membro    = MEMBERS_DISTRIBUTION.find(m => m.email === emailNorm)
  if (!membro) return Response.json({ error: 'Membro não encontrado' }, { status: 404 })

  const spreadsheetId = getSpreadsheetId()
  const sheets        = getSheets()

  const res  = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:R` }),
  )
  const rows = (res.data.values ?? []) as string[][]

  // Build active load map (excluding paused member)
  const loadMap: Record<string, number> = {}
  const activeMembers = MEMBERS_DISTRIBUTION.filter(m => m.ativo && m.email !== emailNorm)
  for (const m of activeMembers) loadMap[m.email] = 0

  for (const row of rows.slice(1)) {
    if (!row[0]) continue
    const rowEmail  = (row[15] ?? '').toLowerCase().trim()
    const rowStatus = row[17] ?? ''
    if (rowEmail in loadMap && !['descartado', 'respondeu'].includes(rowStatus)) {
      loadMap[rowEmail]++
    }
  }

  function pickNext(): string | null {
    const eligible = activeMembers.filter(m => loadMap[m.email] < m.capacidade_semanal_empresas)
    if (!eligible.length) return null
    eligible.sort((a, b) => loadMap[a.email] - loadMap[b.email])
    const picked = eligible[0].email
    loadMap[picked]++
    return picked
  }

  const updates: { range: string; values: string[][] }[] = []
  const now = new Date().toISOString()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) continue
    const rowEmail  = (row[15] ?? '').toLowerCase().trim()
    const rowStatus = row[17] ?? ''
    if (rowEmail !== emailNorm || !REDISTRIB_STATUSES.has(rowStatus)) continue

    const novoMembro = pickNext()
    if (!novoMembro) break // no capacity left

    const sheetRow = i + 1
    updates.push({ range: `'${TAB}'!P${sheetRow}`, values: [[novoMembro]] })
    updates.push({ range: `'${TAB}'!Q${sheetRow}`, values: [[now]] })
  }

  if (updates.length > 0) {
    await withRetry(() =>
      sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates.map(u => ({ range: u.range, values: u.values })),
        },
      }),
    )
  }

  return Response.json({ ok: true, redistribuidos: updates.length / 2 })
}
