import { NextRequest, NextResponse } from 'next/server'
import { getLeadById, updateLeadField } from '@/lib/sheets'
import { PipelineStatus } from '@/types'

const VALID_STATUSES: PipelineStatus[] = [
  'novo',
  'pronto_envio',
  'enviado',
  'respondeu',
  'follow_up',
]

interface UpdateStatusBody {
  status: PipelineStatus
  data_envio?: string
  data_resposta?: string
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body: UpdateStatusBody = await req.json()

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Status inválido. Valores aceitos: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const result = await getLeadById(id)
    if (!result) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }

    const { rowIndex } = result

    await updateLeadField(rowIndex, 'status', body.status)

    if (body.data_envio) {
      await updateLeadField(rowIndex, 'data_envio', body.data_envio)
    }
    if (body.data_resposta) {
      await updateLeadField(rowIndex, 'data_resposta', body.data_resposta)
    }

    return NextResponse.json({ id, status: body.status, message: 'Status atualizado' })
  } catch (error) {
    console.error('Erro ao atualizar status:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
