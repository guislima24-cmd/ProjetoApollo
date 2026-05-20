import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'
import { renderTemplate } from '@/lib/templates/render'
import { supabase } from '@/lib/supabase'
import type { LeadStatus } from '@/lib/types/lead'
import type { TemplateKey } from '@/lib/templates/messages'

export const dynamic = 'force-dynamic'

const TAB = 'Leads_Master'

// Mapeia o status atual para o template que deve ser enviado a seguir
const TEMPLATE_FOR_STATUS: Partial<Record<LeadStatus, TemplateKey | '__pitch__'>> = {
  enriquecido:        '__pitch__',   // nota de conexão
  conexao_aceita:     '__pitch__',   // pitch após aceitar conexão
  mensagem_enviada:   'followup_1',
  followup_1_enviado: 'followup_2',
  followup_2_enviado: 'followup_3',
  followup_3_enviado: 'followup_4',
  followup_4_enviado: 'followup_5',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.email) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const membro_email = session.user.email

  const { id } = await params

  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:AG` }),
  )
  const rows = (res.data.values ?? []) as string[][]
  const row  = rows.find((r, i) => i > 0 && r[0] === id)

  if (!row) {
    return Response.json({ error: 'Lead não encontrado' }, { status: 404 })
  }

  const status               = (row[17] ?? '') as LeadStatus
  const nome_empresa         = row[1]  ?? ''
  const nome_decisor         = row[8]  ?? ''
  const template_pitch_usado = (row[32] ?? 'pitch_longo') as TemplateKey

  // Bloqueios por status terminal
  if (status === 'respondeu') {
    return Response.json({
      ok:       false,
      bloqueado: true,
      motivo:   'Este lead respondeu desde que você abriu o card. Acesse a conversa no LinkedIn.',
    }, { status: 409 })
  }

  if (status === 'descartado') {
    return Response.json({
      ok:       false,
      bloqueado: true,
      motivo:   'Este lead foi descartado.',
    }, { status: 409 })
  }

  const templateSpec = TEMPLATE_FOR_STATUS[status]
  if (!templateSpec) {
    return Response.json({
      error: `Status "${status}" não tem template associado para envio.`,
    }, { status: 400 })
  }

  const templateKey: TemplateKey = templateSpec === '__pitch__'
    ? template_pitch_usado
    : templateSpec

  // Busca perfil + link de apresentação do Supabase em paralelo
  const [profileRes, linkRes] = await Promise.all([
    supabase().from('member_profiles').select('nome, telefone').eq('email', membro_email).single(),
    supabase().from('configuracoes').select('valor').eq('chave', 'link_apresentacao').single(),
  ])

  const profileOverride = profileRes.data
    ? { nome: (profileRes.data.nome as string) ?? '', telefone: (profileRes.data.telefone as string) ?? '' }
    : undefined

  const linkApresentacaoOverride = (linkRes.data?.valor as string | undefined) ?? undefined

  const result = renderTemplate(
    templateKey,
    { lead: nome_decisor, empresa: nome_empresa, membro_email },
    new Date(),
    profileOverride,
    linkApresentacaoOverride,
  )

  if (!result.sucesso) {
    return Response.json({
      ok:        false,
      bloqueado: false,
      motivo:    result.erro,
    }, { status: 422 })
  }

  return Response.json({
    ok:           true,
    mensagem:     result.mensagem,
    template_key: templateKey,
  })
}
