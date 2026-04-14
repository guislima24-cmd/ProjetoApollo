import { NextResponse } from 'next/server'
import { setupMensagemIAHeaders, MEMBER_TABS } from '@/lib/sheets'

export async function GET() {
  try {
    const updated = await setupMensagemIAHeaders()

    return NextResponse.json({
      message: 'Setup concluído',
      abas_configuradas: updated.length > 0 ? updated : 'todas já estavam configuradas',
      abas_verificadas: MEMBER_TABS,
    })
  } catch (error) {
    console.error('Erro no setup:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
