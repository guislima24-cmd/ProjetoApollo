import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSheetGid } from '@/lib/sheets'

export async function GET() {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_ID?.trim()
  if (!spreadsheetId) {
    return NextResponse.json({ error: 'GOOGLE_SHEETS_ID não configurado' }, { status: 500 })
  }

  const gid = await getSheetGid(session.user.memberTab).catch(() => 0)
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`
  return NextResponse.json({ url })
}
