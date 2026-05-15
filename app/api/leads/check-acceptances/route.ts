import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'

export const dynamic = 'force-dynamic'

const TAB = 'Leads_Master'

function normalizeNome(name: string): string {
  return name.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function fuzzyMatch(candidato: string, decisor: string): boolean {
  const a = normalizeNome(candidato)
  const b = normalizeNome(decisor)
  if (a === b) return true

  // Todas as palavras relevantes do nome mais curto devem estar no mais longo
  const wordsA = a.split(' ').filter(w => w.length > 2)
  const wordsB = b.split(' ').filter(w => w.length > 2)
  const [shorter, longerStr] = wordsA.length <= wordsB.length ? [wordsA, b] : [wordsB, a]

  return shorter.length >= 2 && shorter.every(w => longerStr.includes(w))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const email = session.user.email.toLowerCase().trim()

  const body = await req.json() as { connections?: Array<{ nome: string; profile_url?: string }> }
  if (!body.connections?.length) return Response.json({ ok: true, atualizados: 0 })

  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:R` }),
  )
  const rows = (res.data.values ?? []) as string[][]

  const updates: { range: string; values: string[][] }[] = []
  const now = new Date().toISOString()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) continue

    const rowEmail     = (row[15] ?? '').toLowerCase().trim()  // P = membro_responsavel
    const rowStatus    = row[17] ?? ''                         // R = status
    const nomeDecisora = row[8]  ?? ''                         // I = nome_decisor

    if (rowEmail !== email) continue
    if (rowStatus !== 'conexao_enviada') continue
    if (!nomeDecisora) continue

    const matched = body.connections.find(c => fuzzyMatch(c.nome, nomeDecisora))
    if (!matched) continue

    const sheetRow = i + 1
    updates.push({ range: `'${TAB}'!R${sheetRow}`, values: [['conexao_aceita']] })
    updates.push({ range: `'${TAB}'!S${sheetRow}`, values: [[now]] })
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

  return Response.json({ ok: true, atualizados: updates.length / 2 })
}
