import { google } from 'googleapis'
import { PipelineLead, PipelineStatus, MemberLead } from '@/types'
import { MEMBER_TABS } from './members'

// Reexport para manter compatibilidade com imports existentes
export { MEMBER_TABS }

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID!

// Planilha comercial (abas por membro)
const MEMBER_SPREADSHEET_ID =
  process.env.GOOGLE_MEMBER_SHEETS_ID ?? process.env.GOOGLE_SHEETS_ID!

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

export function normalizePrivateKey(key: string | undefined): string | undefined {
  if (!key) return key
  let k = key.trim()
  // Remove aspas envolventes se o valor foi colado no Vercel com aspas
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1)
  }
  // Converte \n literais em quebras de linha reais. Se a chave já vier com
  // quebras reais, esse replace simplesmente não faz nada.
  k = k.replace(/\\n/g, '\n')
  // Normaliza aspas tipográficas que podem aparecer quando a chave é colada
  // a partir de um editor que auto-corrige (raro, mas possível)
  k = k.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
  // Último recurso: se o valor foi colado com lixo em volta (ex: aspas + vírgula
  // do campo JSON inteiro: `"...",`), extrai só o bloco PEM.
  const pemMatch = k.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/)
  if (pemMatch) {
    k = pemMatch[0] + '\n'
  }
  return k
}

/**
 * Resolve as credenciais do service account. Prioridade:
 *   1. GOOGLE_CREDENTIALS_JSON (JSON inteiro — formato mais robusto)
 *   2. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY (par de envs)
 */
export function getCredentials(): { client_email: string; private_key: string } {
  const rawJson = process.env.GOOGLE_CREDENTIALS_JSON
  if (rawJson) {
    const trimmed = rawJson.trim()
    let parsed: { client_email?: string; private_key?: string }
    try {
      parsed = JSON.parse(trimmed)
    } catch (e) {
      throw new Error(
        `GOOGLE_CREDENTIALS_JSON não é um JSON válido: ${(e as Error).message}`
      )
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(
        'GOOGLE_CREDENTIALS_JSON precisa conter os campos client_email e private_key'
      )
    }
    return { client_email: parsed.client_email, private_key: parsed.private_key }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY)
  if (!email || !key) {
    throw new Error(
      'Credenciais do Google ausentes. Configure GOOGLE_CREDENTIALS_JSON ou o par GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY'
    )
  }
  if (!key.includes('BEGIN') || !key.includes('PRIVATE KEY')) {
    throw new Error(
      'GOOGLE_PRIVATE_KEY não parece ser uma PEM válida (falta -----BEGIN PRIVATE KEY-----)'
    )
  }
  return { client_email: email, private_key: key }
}

function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
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

/**
 * Prefixa com `'` campos que comecem com `=`, `+`, `-` ou `@` — defesa contra
 * injeção de fórmulas no Google Sheets.
 */
function sanitizeCell(value: string): string {
  if (value && /^[=+\-@]/.test(value)) return `'${value}`
  return value
}

/** Adiciona um lead na aba do membro e retorna o número da linha inserida */
export async function appendLeadToMemberTab(
  responsavel: string,
  lead: MemberLead
): Promise<number> {
  const sheets = getSheets()
  const mes = new Date().toLocaleString('pt-BR', { month: 'long' })

  const row = new Array(22).fill('')
  row[M.alvo] = sanitizeCell(lead.alvo ?? 'Conéctar')
  row[M.mes] = mes
  row[M.canal] = sanitizeCell(lead.canal ?? (lead.linkedin_url ? 'LinkedIn' : 'E-mail'))
  row[M.setor] = sanitizeCell(lead.setor ?? '')
  row[M.empresa] = sanitizeCell(lead.empresa)
  row[M.nome] = sanitizeCell(lead.nome)
  row[M.link] = sanitizeCell(lead.linkedin_url ?? lead.email ?? '')

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: MEMBER_SPREADSHEET_ID,
    range: `'${responsavel}'!A:V`,
    valueInputOption: 'RAW',
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

export interface RecentMemberLead {
  rowIndex: number
  alvo: string
  mes: string
  canal: string
  setor: string
  empresa: string
  nome: string
  link: string
  mensagemIA: string
}

/**
 * Busca os últimos N leads da aba de um membro, mais recente primeiro.
 * rowIndex é 1-indexed (linha real na planilha, header é 1).
 */
export async function getRecentLeadsFromMemberTab(
  responsavel: string,
  n = 10
): Promise<RecentMemberLead[]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: MEMBER_SPREADSHEET_ID,
    range: `'${responsavel}'!A2:V`,
  })
  const rows = (res.data.values ?? []) as string[][]
  const start = Math.max(0, rows.length - n)
  const result: RecentMemberLead[] = []
  for (let i = rows.length - 1; i >= start; i--) {
    const row = rows[i]
    result.push({
      rowIndex: i + 2, // rows[0] é linha 2 (A2), então rows[i] é linha i+2
      alvo: row[M.alvo] ?? '',
      mes: row[M.mes] ?? '',
      canal: row[M.canal] ?? '',
      setor: row[M.setor] ?? '',
      empresa: row[M.empresa] ?? '',
      nome: row[M.nome] ?? '',
      link: row[M.link] ?? '',
      mensagemIA: row[M.mensagem_ia] ?? '',
    })
  }
  return result
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
