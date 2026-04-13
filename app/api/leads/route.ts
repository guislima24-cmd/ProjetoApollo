import { NextRequest, NextResponse } from 'next/server'
import { appendLead } from '@/lib/sheets'
import { PipelineLead } from '@/types'

interface CreateLeadBody {
  nome: string
  cargo?: string
  empresa: string
  email?: string
  linkedin_url?: string
  fonte?: string
  responsavel?: string
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateLeadBody = await req.json()

    if (!body.nome || !body.empresa) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: nome, empresa' },
        { status: 400 }
      )
    }

    const lead: PipelineLead = {
      id: crypto.randomUUID(),
      nome: body.nome,
      cargo: body.cargo,
      empresa: body.empresa,
      email: body.email,
      linkedin_url: body.linkedin_url,
      fonte: body.fonte ?? 'Manual',
      status: 'novo',
      responsavel: body.responsavel,
    }

    await appendLead(lead)

    return NextResponse.json({ id: lead.id, message: 'Lead criado com sucesso' }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar lead:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
