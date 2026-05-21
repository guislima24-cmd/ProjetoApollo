import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getTabByEmail } from '@/lib/members.config'
import { appendMemberTabRow } from '@/lib/sheets/member-tab'
import { updateLeadsCSVRow } from '@/lib/sheets/leads-csv'
import { getSheets, getSpreadsheetId, withRetry } from '@/lib/sheets/client'
import { supabase } from '@/lib/supabase'
import type { MemberLead } from '@/lib/types/lead'

export const dynamic = 'force-dynamic'

interface SendConnectionBody {
  csvRowIndex:   number
  decisorIdx:    number
  decisorNome:   string
  decisorUrl:    string
  empresa:       string
  setor:         string
  website:       string
  templatePitch?: string
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const memberTab = getTabByEmail(session.user.email)
    if (!memberTab) {
      return Response.json({ error: 'Membro não encontrado' }, { status: 403 })
    }

    const body = await req.json() as SendConnectionBody
    const {
      csvRowIndex, decisorIdx, decisorNome, decisorUrl,
      empresa, setor, templatePitch = 'pitch_longo',
    } = body

    if (!csvRowIndex || decisorIdx === undefined || decisorIdx < 0) {
      return Response.json({ error: 'csvRowIndex e decisorIdx são obrigatórios' }, { status: 400 })
    }

    const sysId    = crypto.randomUUID()
    const now      = new Date()
    const nowIso   = now.toISOString()
    const dd       = String(now.getDate()).padStart(2, '0')
    const mm       = String(now.getMonth() + 1).padStart(2, '0')
    const hoje     = `${dd}/${mm}/${now.getFullYear()}`
    const mesAtual = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(now)

    // ── 1. Cria linha na aba do membro ────────────────────────────────────────
    const novoLead: Omit<MemberLead, 'sheetRow'> = {
      alvo:                  '',
      mes:                   mesAtual,
      canal:                 'LinkedIn',
      setor,
      empresa,
      nome_contato:          decisorNome,
      numero_link:           decisorUrl,
      quem_respondeu:        '',
      data_conexao:          hoje,
      quantos_contatos:      '1',
      marcou_rd:             'Aguardando conexão',
      data_rd:               '',
      no_show:               '',
      sql:                   '',
      marcou_rp:             '',
      data_proposta:         '',
      contrato:              '',
      data_contrato:         '',
      motivo_recusa:         '',
      ciclo_conversao:       '',
      observacoes:           '',
      sys_id:                sysId,
      sys_status:            'conexao_enviada',
      sys_data_ultima_acao:  nowIso,
      sys_data_proxima_acao: '',
      sys_tentativas:        '1',
      sys_template_pitch:    templatePitch,
      sys_leads_csv_row:     String(csvRowIndex),
      sys_k_sugestao:        '',
    }

    const sheetRow = await appendMemberTabRow(memberTab, novoLead)

    // ── 2. Atualiza Leads CSV cols S e T ──────────────────────────────────────
    const sheets        = getSheets()
    const spreadsheetId = getSpreadsheetId()

    const cellRes = await withRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'Leads CSV'!S${csvRowIndex}:T${csvRowIndex}`,
      }),
    )
    const [currentS = '', currentT = ''] = cellRes.data.values?.[0] ?? []
    const tentadosAtuais  = currentS
      ? currentS.split(',').map((s: string) => s.trim()).filter(Boolean)
      : []
    const novoProspectado = [...new Set([...tentadosAtuais, String(decisorIdx)])].join(',')

    await updateLeadsCSVRow(csvRowIndex, {
      prospectado:     novoProspectado,
      data_prospeccao: currentT || hoje,
    })

    // ── 3. Log Supabase (fire-and-forget) ─────────────────────────────────────
    supabase()
      .from('activity_log')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        lead_id:            sysId,
        status_anterior:    'nao_contatado',
        status_novo:        'conexao_enviada',
        membro_responsavel: memberTab,
        timestamp:          nowIso,
        nota:               `Conexão enviada (empresa: ${empresa}, decisor idx ${decisorIdx})`,
      } as any)
      .then(({ error }) => {
        if (error) console.error('[send-connection] Supabase log error:', error.message)
      })

    console.log(`[send-connection] ✓ ${empresa} decisor#${decisorIdx} → ${memberTab} row=${sheetRow}`)
    return Response.json({ ok: true, sysId, sheetRow })

  } catch (err) {
    console.error('[send-connection] ERRO:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
