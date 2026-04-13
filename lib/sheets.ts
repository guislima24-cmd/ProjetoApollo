import { google } from 'googleapis'
import { PipelineLead, PipelineStatus } from '@/types'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!
const SHEET_NAME = 'Leads'

// Índices das colunas (base 0): A=0, B=1, ...
const COL = {
  id: 0,
  nome: 1,
  cargo: 2,
  empresa: 3,
  email: 4,
  linkedin_url: 5,
  fonte: 6,
  mensagem_gerada: 7,
  status: 8,
  data_envio: 9,
  data_resposta: 10,
  responsavel: 11,
} as const

type ColKey = keyof typeof COL

function getSheets() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    undefined,
    process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  )
  return google.sheets({ version: 'v4', auth })
}

function rowToLead(row: string[]): PipelineLead {
  return {
    id: row[COL.id] ?? '',
    nome: row[COL.nome] ?? '',
    cargo: row[COL.cargo] || undefined,
    empresa: row[COL.empresa] ?? '',
    email: row[COL.email] || undefined,
    linkedin_url: row[COL.linkedin_url] || undefined,
    fonte: row[COL.fonte] || undefined,
    mensagem_gerada: row[COL.mensagem_gerada] || undefined,
    status: (row[COL.status] as PipelineStatus) || 'novo',
    data_envio: row[COL.data_envio] || undefined,
    data_resposta: row[COL.data_resposta] || undefined,
    responsavel: row[COL.responsavel] || undefined,
  }
}

function leadToRow(lead: PipelineLead): string[] {
  return [
    lead.id,
    lead.nome,
    lead.cargo ?? '',
    lead.empresa,
    lead.email ?? '',
    lead.linkedin_url ?? '',
    lead.fonte ?? '',
    lead.mensagem_gerada ?? '',
    lead.status,
    lead.data_envio ?? '',
    lead.data_resposta ?? '',
    lead.responsavel ?? '',
  ]
}

/** Adiciona um lead como nova linha na planilha */
export async function appendLead(lead: PipelineLead): Promise<void> {
  const sheets = getSheets()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:L`,
    valueInputOption: 'RAW',
    requestBody: { values: [leadToRow(lead)] },
  })
}

/** Busca um lead pelo id. Retorna o lead e o número da linha (1-indexed) */
export async function getLeadById(
  id: string
): Promise<{ lead: PipelineLead; rowIndex: number } | null> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:L`,
  })

  const rows = (res.data.values ?? []) as string[][]
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][COL.id] === id) {
      return { lead: rowToLead(rows[i]), rowIndex: i + 1 }
    }
  }
  return null
}

/** Atualiza um campo específico de um lead pelo número da linha */
export async function updateLeadField(
  rowIndex: number,
  field: ColKey,
  value: string
): Promise<void> {
  const sheets = getSheets()
  const colLetter = String.fromCharCode(65 + COL[field]) // A=65
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${colLetter}${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
}
