import { google } from 'googleapis'
import { PipelineLead, PipelineStatus, MemberLead } from '@/types'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!

// Planilha comercial (abas por membro)
const MEMBER_SPREADSHEET_ID =
  process.env.GOOGLE_MEMBER_SHEETS_ID ?? process.env.GOOGLE_SHEETS_ID!

export const MEMBER_TABS = [
  'Anna', 'Daniel', 'Duda', 'Felipe',
  'Gui Lima', 'Gui Midolli', 'Gustavo',
  'Larissa', 'Léo', 'Leticia', 'Tiago',
]

// Índices das colunas nas abas dos membros (base 0)
// A=Alvo B=Mês C=Canal D=Setor E=Empresa F=Nome G=Número/Link ... V=Mensagem IA
const M = {
  alvo: 0,        // A
  mes: 1,         // B
  canal: 2,       // C
  setor: 3,       // D
  empresa: 4,     // E
  nome: 5,        // F
  link: 6,        // G
  mensagem_ia: 21 // V
} as const
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

function normalizePrivateKey(key: string | undefined): string | undefined {
  if (!key) return key
  let k = key.trim()
  // Remove aspas envolventes se o valor foi colado no Vercel com aspas
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1)
  }
  // Converte \n literais em quebras de linha reais. Se a chave já vier com
  // quebras reais, esse replace simplesmente não faz nada.
  k = k.replace(/\\n/g, '\n')
  return k
}

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
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

// ─── Funções para abas dos membros ───────────────────────────────────────────

/** Adiciona um lead na aba do membro e retorna o número da linha inserida */
export async function appendLeadToMemberTab(
  responsavel: string,
  lead: MemberLead
): Promise<number> {
  const sheets = getSheets()
  const mes = new Date().toLocaleString('pt-BR', { month: 'long' })

  const row = new Array(22).fill('')
  row[M.alvo] = lead.alvo ?? 'Conéctar'
  row[M.mes] = mes
  row[M.canal] = lead.canal ?? (lead.linkedin_url ? 'LinkedIn' : 'E-mail')
  row[M.setor] = lead.setor ?? ''
  row[M.empresa] = lead.empresa
  row[M.nome] = lead.nome
  row[M.link] = lead.linkedin_url ?? lead.email ?? ''

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: MEMBER_SPREADSHEET_ID,
    range: `'${responsavel}'!A:V`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  })

  // Extrai o número da linha do range retornado (ex: "'Anna'!A5:V5")
  const updatedRange = res.data.updates?.updatedRange ?? ''
  const match = updatedRange.match(/(\d+)$/)
  return match ? parseInt(match[1]) : -1
}

/** Escreve a mensagem gerada pela IA na coluna V da aba do membro */
export async function updateMensagemIA(
  responsavel: string,
  rowIndex: number,
  mensagem: string
): Promise<void> {
  const sheets = getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: MEMBER_SPREADSHEET_ID,
    range: `'${responsavel}'!V${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[mensagem]] },
  })
}

/** Garante que todas as abas de membros têm o cabeçalho "Mensagem IA" na coluna V */
export async function setupMensagemIAHeaders(): Promise<string[]> {
  const sheets = getSheets()
  const updated: string[] = []

  for (const tab of MEMBER_TABS) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: MEMBER_SPREADSHEET_ID,
        range: `'${tab}'!V1`,
      })
      const current = res.data.values?.[0]?.[0] ?? ''
      if (current !== 'Mensagem IA') {
        await sheets.spreadsheets.values.update({
          spreadsheetId: MEMBER_SPREADSHEET_ID,
          range: `'${tab}'!V1`,
          valueInputOption: 'RAW',
          requestBody: { values: [['Mensagem IA']] },
        })
        updated.push(tab)
      }
    } catch {
      // Aba não encontrada — ignora
    }
  }

  return updated
}

// ─── Funções para aba pipeline (Leads) ───────────────────────────────────────

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
