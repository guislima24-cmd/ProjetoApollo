import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { leads } = await req.json()

    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: 'Nenhum lead para enviar' }, { status: 400 })
    }

    const results = []

    for (const lead of leads) {
      if (!lead.email || !lead.mensagem_gerada) continue

      try {
        const { data, error } = await resend.emails.send({
          from: 'UFABC Júnior <prospectai@ufabcjunior.com.br>',
          to: lead.email,
          subject: `Olá, ${lead.nome} — UFABC Júnior`,
          text: lead.mensagem_gerada,
        })

        if (error) {
          results.push({ id: lead.id, status: 'error', error: error.message })
        } else {
          results.push({ id: lead.id, status: 'sent', emailId: data?.id })
        }
      } catch (err) {
        results.push({ id: lead.id, status: 'error', error: 'Falha no envio' })
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 200))
    }

    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
