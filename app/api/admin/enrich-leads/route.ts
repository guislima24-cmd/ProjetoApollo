import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { isAdminEmail } from '@/lib/members.config'
import { enrichLinkedInLead } from '@/lib/agent/enrich-linkedin-lead'
import { updateLeadStatus } from '@/lib/sheets/lead-status'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'
import type { LeadMaster } from '@/lib/types/lead'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 min — lotes longos

const TAB        = 'Leads_Master'
const LAST_COL   = 'AF'
const BATCH_SIZE = 20

async function guardAdmin() {
  const session = await auth()
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return Response.json({ error: 'Acesso negado' }, { status: 403 })
  }
  return session.user.email
}

async function getNaoContatados(): Promise<Array<{ rowIdx: number; lead: LeadMaster }>> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `'${TAB}'!A:${LAST_COL}` }),
  )

  const rows = (res.data.values ?? []) as string[][]
  const result: Array<{ rowIdx: number; lead: LeadMaster }> = []

  for (let i = 1; i < rows.length && result.length < BATCH_SIZE; i++) {
    const status = rows[i][17] ?? ''  // col R
    if (status !== 'nao_contatado') continue

    result.push({
      rowIdx: i + 1,  // 1-based sheet row
      lead: rowToLead(rows[i]),
    })
  }

  return result
}

function rowToLead(row: string[]): LeadMaster {
  return {
    id_lead:                  row[0]  ?? '',
    nome_empresa:             row[1]  ?? '',
    setor:                    row[2]  ?? '',
    porte:                    row[3]  ?? '',
    cidade:                   row[4]  ?? '',
    estado:                   row[5]  ?? '',
    site:                     row[6]  ?? '',
    linkedin_empresa:         row[7]  ?? '',
    nome_decisor:             row[8]  ?? '',
    cargo_decisor:            row[9]  ?? '',
    linkedin_decisor:         row[10] ?? '',
    email_decisor:            row[11] ?? '',
    telefone_decisor:         row[12] ?? '',
    fonte:                    (row[13] ?? 'apollo_csv') as LeadMaster['fonte'],
    data_importacao:          row[14] ?? '',
    membro_responsavel:       row[15] ?? '',
    data_atribuicao:          row[16] ?? '',
    status:                   (row[17] ?? 'nao_contatado') as LeadMaster['status'],
    data_ultima_acao:         row[18] ?? '',
    data_proxima_acao:        row[19] ?? '',
    tentativas_followup:      parseInt(row[20] ?? '0', 10) || 0,
    nota_conexao:             row[21] ?? '',
    mensagem_pitch:     row[22] ?? '',
    followup_1:               row[23] ?? '',
    followup_2:               row[24] ?? '',
    gancho_personalizado:     row[25] ?? '',
    justificativa_ia:         row[26] ?? '',
    observacoes:              row[27] ?? '',
    link_conversa_linkedin:   row[28] ?? '',
    ultima_mensagem_recebida: row[29] ?? '',
    data_resposta:            row[30] ?? '',
    data_descartado:          row[31] ?? '',
  }
}

async function saveEnrichment(rowIdx: number, enrichment: {
  nota_conexao:         string
  mensagem_pitch: string
  followup_1:           string
  followup_2:           string
  gancho_personalizado: string
  justificativa_ia:     string
}): Promise<void> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  // Colunas V-AA (índices 21-26)
  await withRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range:            `'${TAB}'!V${rowIdx}:AA${rowIdx}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[
        enrichment.nota_conexao,
        enrichment.mensagem_pitch,
        enrichment.followup_1,
        enrichment.followup_2,
        enrichment.gancho_personalizado,
        enrichment.justificativa_ia,
      ]]},
    }),
  )
}

export async function POST(req: NextRequest) {
  const emailOrRes = await guardAdmin()
  if (emailOrRes instanceof Response) return emailOrRes
  const adminEmail = emailOrRes as string

  const leads = await getNaoContatados()

  if (!leads.length) {
    return Response.json({ ok: true, processados: 0, erros: 0, message: 'Nenhum lead nao_contatado encontrado.' })
  }

  let processados = 0
  let erros       = 0
  const detalhes: Array<{ id: string; nome: string; ok: boolean; erro?: string }> = []

  for (const { rowIdx, lead } of leads) {
    if (!lead.id_lead) { erros++; continue }

    let tentativas = 0
    let sucesso    = false

    while (tentativas < 3 && !sucesso) {
      tentativas++
      try {
        const enrichment = await enrichLinkedInLead({
          nome_empresa:  lead.nome_empresa,
          setor:         lead.setor,
          porte:         lead.porte,
          cidade:        lead.cidade,
          estado:        lead.estado,
          nome_decisor:  lead.nome_decisor,
          cargo_decisor: lead.cargo_decisor,
        })

        await saveEnrichment(rowIdx, enrichment)
        await updateLeadStatus(lead.id_lead, 'enriquecido', adminEmail)

        processados++
        sucesso = true
        detalhes.push({ id: lead.id_lead, nome: lead.nome_empresa, ok: true })
        console.log(`[enrich] OK: ${lead.nome_empresa}`)
      } catch (err) {
        console.error(`[enrich] Tentativa ${tentativas}/3 falhou para ${lead.nome_empresa}:`, err)
        if (tentativas === 3) {
          // Marca como erro após 3 falhas
          try {
            await updateLeadStatus(lead.id_lead, 'erro_enriquecimento', adminEmail)
          } catch {}
          erros++
          detalhes.push({ id: lead.id_lead, nome: lead.nome_empresa, ok: false, erro: String(err) })
        }
      }
    }
  }

  return Response.json({ ok: true, processados, erros, total: leads.length, detalhes })
}

// GET: retorna quantos leads precisam de enriquecimento
export async function GET(_req: NextRequest) {
  const emailOrRes = await guardAdmin()
  if (emailOrRes instanceof Response) return emailOrRes

  const leads = await getNaoContatados()
  return Response.json({ pendentes: leads.length })
}
