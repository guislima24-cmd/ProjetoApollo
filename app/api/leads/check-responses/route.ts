import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const TAB = 'Leads_Master'

// Statuses que jamais recebem followup — regra absoluta
const NO_FOLLOWUP = new Set(['respondeu', 'descartado'])

function normalizeNome(name: string): string {
  return (name ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function fuzzyMatch(candidato: string, decisor: string): boolean {
  const a = normalizeNome(candidato)
  const b = normalizeNome(decisor)
  if (!a || !b) return false
  if (a === b) return true

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

  const body = await req.json() as { conversations?: Array<{ nome: string }> }
  if (!body.conversations?.length) return Response.json({ ok: true, atualizados: 0 })

  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:R` }),
  )
  const rows = (res.data.values ?? []) as string[][]

  const updates: { range: string; values: string[][] }[] = []
  const atualizados: { id: string; nome: string }[] = []
  const now = new Date().toISOString()

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) continue

    const leadId       = row[0]
    const rowEmail     = (row[15] ?? '').toLowerCase().trim()  // P
    const rowStatus    = row[17] ?? ''                         // R
    const nomeDecisora = row[8]  ?? ''                         // I
    const nomeEmpresa  = row[1]  ?? ''                         // B

    if (rowEmail !== email) continue

    // REGRA: leads já respondidos ou descartados nunca recebem followup
    if (NO_FOLLOWUP.has(rowStatus)) continue

    const matched = body.conversations.find(c => fuzzyMatch(c.nome, nomeDecisora))
    if (!matched) continue

    const sheetRow = i + 1
    updates.push({ range: `'${TAB}'!R${sheetRow}`, values: [['respondeu']] })
    updates.push({ range: `'${TAB}'!S${sheetRow}`, values: [[now]] })  // data_ultima_acao
    updates.push({ range: `'${TAB}'!AE${sheetRow}`, values: [[now]] }) // data_resposta
    atualizados.push({ id: leadId, nome: nomeEmpresa })
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

    // Log no Supabase para cada lead atualizado
    const sb = supabase()
    for (const lead of atualizados) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from('activity_log') as any).insert({
          lead_id:            lead.id,
          status_anterior:    null,
          status_novo:        'respondeu',
          membro_responsavel: email,
          timestamp:          now,
        })
      } catch { /* log failure não bloqueia */ }
    }
  }

  return Response.json({ ok: true, atualizados: atualizados.length, leads: atualizados })
}
