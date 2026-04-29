/**
 * GET /api/sheets/columns?tab=Gui Lima
 * Retorna os cabeçalhos reais (linha 1) e as primeiras 2 linhas de dados
 * de uma aba da planilha. Usado para verificar o mapeamento de colunas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { google } from 'googleapis'

function getSheets() {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON
  if (!raw) throw new Error('GOOGLE_CREDENTIALS_JSON não configurada')
  const creds = JSON.parse(raw.trim())
  const authClient = new google.auth.GoogleAuth({
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return google.sheets({ version: 'v4', auth: authClient })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const tab = req.nextUrl.searchParams.get('tab') ?? session.user.memberTab
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID

  try {
    const sheets = getSheets()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId!,
      range: `'${tab.replace(/'/g, "''")}'!A1:T3`,
    })

    const rows = res.data.values ?? []
    const headers = rows[0] ?? []
    const dataRows = rows.slice(1)

    return NextResponse.json({
      tab,
      spreadsheetId,
      headers: headers.map((h, i) => ({
        col: String.fromCharCode(65 + i),
        index: i,
        header: h,
      })),
      sample_rows: dataRows,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao ler planilha' },
      { status: 500 }
    )
  }
}
