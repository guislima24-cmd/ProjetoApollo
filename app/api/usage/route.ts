import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdmin } from '@/lib/members.config'
import { getUsageLogs } from '@/lib/sheets'

export async function GET() {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const logs = await getUsageLogs(30)

  const now = new Date()
  const startOfDay   = new Date(now); startOfDay.setHours(0,0,0,0)
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay())
  const startOfMonth = new Date(now); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0)

  function parseDate(str: string): Date {
    // Formato pt-BR: "dd/mm/aaaa, hh:mm:ss"
    const [datePart, timePart] = str.split(', ')
    if (!datePart) return new Date(0)
    const [d, m, y] = datePart.split('/')
    return new Date(`${y}-${m}-${d}T${timePart ?? '00:00:00'}`)
  }

  const logsWithDate = logs.map(l => ({ ...l, date: parseDate(l.dataHora) }))

  const totais = {
    mes:    { geracoes: 0, tokens: 0, custo: 0, registros: 0, emails: 0 },
    semana: { geracoes: 0, tokens: 0, custo: 0, registros: 0, emails: 0 },
    hoje:   { geracoes: 0, tokens: 0, custo: 0, registros: 0, emails: 0 },
  }

  const porMembro: Record<string, { geracoes: number; tokens: number; custo: number }> = {}

  for (const log of logsWithDate) {
    const inMes    = log.date >= startOfMonth
    const inSemana = log.date >= startOfWeek
    const inHoje   = log.date >= startOfDay

    const isGeracao  = log.acao.startsWith('geração')
    const isRegistro = log.acao === 'registro'
    const isEmail    = log.acao === 'email_enviado'
    const tokens = log.tokensInput + log.tokensOutput

    for (const [period, flag] of [['mes', inMes], ['semana', inSemana], ['hoje', inHoje]] as const) {
      if (!flag) continue
      const t = totais[period]
      if (isGeracao)  { t.geracoes++; t.tokens += tokens; t.custo += log.custo }
      if (isRegistro) t.registros++
      if (isEmail)    t.emails++
    }

    if (inMes) {
      if (!porMembro[log.memberTab]) porMembro[log.memberTab] = { geracoes: 0, tokens: 0, custo: 0 }
      if (isGeracao) {
        porMembro[log.memberTab].geracoes++
        porMembro[log.memberTab].tokens += tokens
        porMembro[log.memberTab].custo  += log.custo
      }
    }
  }

  return NextResponse.json({ totais, porMembro, totalLogs: logs.length })
}
