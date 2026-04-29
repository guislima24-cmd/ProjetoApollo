/**
 * GET /api/sheets/setup
 *
 * Lê a planilha definida em GOOGLE_SHEETS_ID, cria abas faltantes
 * e adiciona cabeçalhos. Acesse pelo navegador após estar logado.
 *
 * Pré-requisito:
 *   1. Crie uma planilha vazia em sheets.google.com
 *   2. Compartilhe com prospectai-sheets@tonal-asset-493216-t4.iam.gserviceaccount.com (Editor)
 *   3. Cole o ID (da URL) em GOOGLE_SHEETS_ID no .env.local
 *   4. Reinicie o servidor e acesse esta rota
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setupSpreadsheet } from '@/lib/sheets'

async function run() {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    const result = await setupSpreadsheet()
    return NextResponse.json({
      ok: true,
      ...result,
      message: [
        result.tabsAdded.length > 0 ? `Abas criadas: ${result.tabsAdded.join(', ')}` : null,
        result.headersAdded.length > 0 ? `Cabeçalhos adicionados: ${result.headersAdded.join(', ')}` : null,
        result.tabsAdded.length === 0 && result.headersAdded.length === 0
          ? 'Planilha já está configurada corretamente.'
          : null,
      ].filter(Boolean).join(' | '),
    })
  } catch (err) {
    console.error('[sheets/setup]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao configurar planilha' },
      { status: 500 }
    )
  }
}

export const GET = run
export const POST = run
