/**
 * Google Sheets — planilha CRM real do comercial UFABC Júnior.
 *
 * Estrutura por aba de membro (colunas A:T):
 *   A  Alvo (KPI)
 *   B  Mês (KPI)
 *   C  Canal (KPI)        (Email | LinkedIn)
 *   D  Setor (KPI)
 *   E  Empresa contatada
 *   F  Nome do contato
 *   G  Número/Link
 *   H  Quem respondeu?    ← usado como marcador de resposta pelo sistema
 *   I  Data de conexão
 *   J  Quantos contatos?
 *   K  Marcou RD?
 *   L  Data RD
 *   M  No show?
 *   N  SQL               (índice 13)
 *   O  Marcou RP?        (índice 14)
 *   P  Data proposta     (índice 15)
 *   Q  Contrato?         (índice 16)
 *   R  Data contrato     (índice 17)
 *   S  Motivo da recusa  (índice 18)
 *   T  Ciclo de conversão (índice 19)
 *
 * Linha 1 = cabeçalhos; linha 2 = legenda (ignorada ao ler dados).
 * O sistema preenche B, C, D, E, F, G e I ao registrar.
 * Colunas K–T são preenchidas manualmente pelo membro na planilha.
 */

import { google, sheets_v4 } from 'googleapis'
import { getAllMemberTabs, MEMBER_TABS } from './members.config'
import type { ProspectionRecord } from '@/types'

// ─── Credenciais ─────────────────────────────────────────────────────────────

function normalizePrivateKey(key: string): string {
  let k = key.trim()
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1)
  }
  k = k.replace(/\\n/g, '\n')
  const pemMatch = k.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/)
  if (pemMatch) k = pemMatch[0] + '\n'
  return k
}

function getCredentials(): { client_email: string; private_key: string } {
  const rawJson = process.env.GOOGLE_CREDENTIALS_JSON
  if (rawJson) {
    const parsed = JSON.parse(rawJson.trim()) as { client_email?: string; private_key?: string }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('GOOGLE_CREDENTIALS_JSON precisa ter client_email e private_key')
    }
    return { client_email: parsed.client_email, private_key: parsed.private_key }
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY ?? '')
  if (!email || !key) {
    throw new Error('Configure GOOGLE_CREDENTIALS_JSON ou GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY')
  }
  return { client_email: email, private_key: key }
}

function getSheets(): sheets_v4.Sheets {
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

// ─── Retry com backoff ───────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseMs = 1000): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (err: any) {
      lastErr = err
      const isRateLimit = err?.code === 429 || err?.status === 429 ||
        String(err?.message ?? '').includes('RESOURCE_EXHAUSTED') ||
        String(err?.message ?? '').includes('Quota')
      if (isRateLimit && i < retries - 1) {
        await new Promise(r => setTimeout(r, baseMs * 2 ** i))
        continue
      }
      throw err
    }
  }
  throw lastErr
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

function sanitize(value: string): string {
  if (value && /^[=+\-@]/.test(value)) return `'${value}`
  return value
}

// ─── Índices de colunas (base 0) — planilha real do comercial ────────────────

const COL = {
  alvo:             0,   // A  Alvo (KPI)
  mes:              1,   // B  Mês (KPI)
  canal:            2,   // C  Canal (KPI)
  setor:            3,   // D  Setor (KPI)
  empresa:          4,   // E  Empresa contatada
  nome:             5,   // F  Nome do contato
  contato:          6,   // G  Número/Link
  quem_respondeu:   7,   // H  Quem respondeu?
  data_conexao:     8,   // I  Data de conexão
  // J–T preenchidas manualmente pelo membro
} as const

// Cabeçalhos usados ao criar uma aba nova (não modifica abas existentes)
const HEADERS = [
  'Alvo (KPI)', 'Mês (KPI)', 'Canal (KPI)', 'Setor (KPI)',
  'Empresa contatada', 'Nome do contato', 'Número/Link',
  'Quem respondeu?', 'Data de conexão', 'Quantos contatos?',
  'Marcou RD?', 'Data RD', 'No show?', 'SQL',
  'Marcou RP?', 'Data proposta', 'Contrato?', 'Data contrato',
  'Motivo da recusa', 'Ciclo de conversão',
]

// ─── Setup: criar ou reutilizar planilha ────────────────────────────────────

/**
 * Setup da planilha CRM.
 *
 * Fluxo:
 *   1. Usuário cria uma planilha vazia no Google Sheets manualmente.
 *   2. Compartilha com o service account como Editor.
 *   3. Adiciona o ID ao GOOGLE_SHEETS_ID no .env.local.
 *   4. Chama /api/sheets/setup — este método cria abas e cabeçalhos.
 */
export async function setupSpreadsheet(): Promise<{
  spreadsheetId: string
  tabsAdded: string[]
  tabsExisting: string[]
  headersAdded: string[]
}> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID?.trim()

  if (!spreadsheetId) {
    throw new Error(
      'GOOGLE_SHEETS_ID não configurado. ' +
      'Crie uma planilha no Google Sheets, compartilhe com ' +
      'prospectai-sheets@tonal-asset-493216-t4.iam.gserviceaccount.com como Editor, ' +
      'cole o ID da URL no GOOGLE_SHEETS_ID do .env.local e reinicie o servidor.'
    )
  }

  const sheets = getSheets()
  const members = getAllMemberTabs()

  // Lê metadados completos (títulos + sheetId de cada aba)
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  })
  const existingSheets = meta.data.sheets ?? []
  const existingTitles = existingSheets.map(s => s.properties?.title ?? '').filter(Boolean)

  const tabsAdded: string[] = []
  const tabsExisting: string[] = []

  // Cria abas que faltam
  for (const member of members) {
    if (existingTitles.includes(member)) {
      tabsExisting.push(member)
    } else {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: member } } }] },
      })
      tabsAdded.push(member)
    }
  }

  // Re-lê para obter sheetIds atualizados (inclui abas recém criadas)
  const metaFull = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  })
  const sheetsByTitle = Object.fromEntries(
    (metaFull.data.sheets ?? []).map(s => [s.properties?.title ?? '', s.properties?.sheetId ?? 0])
  )

  // Garante cabeçalhos e aplica formatação em todas as abas
  const headersAdded: string[] = []
  for (const member of members) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${quoteSheet(member)}!A1`,
    })
    const currentHeader = res.data.values?.[0]?.[0] ?? ''
    if (currentHeader !== 'Data de Envio') {
      await addHeadersToTab(sheets, spreadsheetId, member)
      headersAdded.push(member)
    }

    const sheetId = sheetsByTitle[member]
    if (sheetId !== undefined) {
      await applySheetFormatting(sheets, spreadsheetId, sheetId)
    }
  }

  return { spreadsheetId, tabsAdded, tabsExisting, headersAdded }
}

// ─── Formatação visual ────────────────────────────────────────────────────────

// Converte hex "#RRGGBB" para objeto { red, green, blue } com valores 0-1
function hexColor(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  return {
    red:   ((n >> 16) & 0xff) / 255,
    green: ((n >> 8)  & 0xff) / 255,
    blue:  ( n        & 0xff) / 255,
  }
}

async function applySheetFormatting(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  const requests: any[] = []

  // ── 1. Larguras das colunas (em pixels) ─────────────────────────────────────
  const columnWidths = [
    110, // A Data de Envio
    70,  // B Mês
    90,  // C Canal
    200, // D Empresa
    120, // E Setor
    180, // F Nome do Lead
    200, // G Cargo
    280, // H Contato (URL)
    120, // I Status
    130, // J Data de Resposta
    200, // K Observações
    400, // L Mensagem IA
  ]

  columnWidths.forEach((px, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: 'pixelSize',
      },
    })
  })

  // ── 2. Altura da linha de cabeçalho ─────────────────────────────────────────
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 36 },
      fields: 'pixelSize',
    },
  })

  // ── 3. Formato do cabeçalho (linha 1): negrito, fundo verde, texto branco ───
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
      cell: {
        userEnteredFormat: {
          backgroundColor: hexColor('#1a3d22'),
          textFormat: {
            bold: true,
            fontSize: 10,
            foregroundColor: hexColor('#F8EDD9'),
          },
          verticalAlignment: 'MIDDLE',
          horizontalAlignment: 'CENTER',
          wrapStrategy: 'CLIP',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment,wrapStrategy)',
    },
  })

  // ── 4. Linhas de dados: fonte padrão, alinhamento vertical centralizado ─────
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 12 },
      cell: {
        userEnteredFormat: {
          verticalAlignment: 'MIDDLE',
          textFormat: { fontSize: 10 },
        },
      },
      fields: 'userEnteredFormat(verticalAlignment,textFormat)',
    },
  })

  // ── 5. Coluna G (Contato/Link) — link azul ──────────────────────────────────
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 6, endColumnIndex: 7 },
      cell: {
        userEnteredFormat: {
          textFormat: {
            foregroundColor: hexColor('#4fa3e0'),
            underline: true,
            fontSize: 10,
          },
        },
      },
      fields: 'userEnteredFormat(textFormat)',
    },
  })

  // ── 6. Congelar linha 1 ──────────────────────────────────────────────────────
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: 'gridProperties.frozenRowCount',
    },
  })

  // ── 7. Dropdown de Status (coluna H = índice 7 = Quem respondeu?) ───────────
  const statusValues = ['Aguardando', 'Respondeu', 'Reunião', 'Follow-up', 'Descartado']
  requests.push({
    setDataValidation: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: statusValues.map(v => ({ userEnteredValue: v })),
        },
        showCustomUi: true,
        strict: true,
      },
    },
  })

  // ── 8. Dropdown de Canal (coluna C = índice 2) ───────────────────────────────
  requests.push({
    setDataValidation: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: [{ userEnteredValue: 'LinkedIn' }, { userEnteredValue: 'Email' }],
        },
        showCustomUi: true,
        strict: false,
      },
    },
  })

  // ── 9. Formatação condicional de Status (coluna I) ───────────────────────────
  const statusFormats: Array<{ value: string; bg: string; text: string }> = [
    { value: 'Aguardando',  bg: '#fff3cd', text: '#664d03' },
    { value: 'Respondeu',   bg: '#d1e7dd', text: '#0a3622' },
    { value: 'Reunião',     bg: '#cfe2ff', text: '#084298' },
    { value: 'Follow-up',   bg: '#e8d5b7', text: '#5a3e28' },
    { value: 'Descartado',  bg: '#f8d7da', text: '#58151c' },
  ]

  for (const { value, bg, text } of statusFormats) {
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: value }],
            },
            format: {
              backgroundColor: hexColor(bg),
              textFormat: { foregroundColor: hexColor(text), bold: false },
            },
          },
        },
        index: 0,
      },
    })
  }

  // ── 10. Linhas alternadas (banded range) ────────────────────────────────────
  requests.push({
    addBanding: {
      bandedRange: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 12 },
        rowProperties: {
          headerColor:       hexColor('#1a3d22'),
          firstBandColor:    hexColor('#ffffff'),
          secondBandColor:   hexColor('#f4f8f4'),
        },
      },
    },
  })

  // Envia todas as requests em um único batchUpdate
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  })
}

async function addHeadersToTab(sheets: sheets_v4.Sheets, spreadsheetId: string, tab: string) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheet(tab)}!A1:T1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  })
}

// ─── Operações CRM ───────────────────────────────────────────────────────────

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_ID
  if (!id) throw new Error('GOOGLE_SHEETS_ID não configurado. Execute /api/sheets/setup primeiro.')
  return id
}

/**
 * Garante que a aba do membro existe.
 * Se já existir (caso da planilha real em uso), não toca em nada.
 * Se não existir (membro novo), cria com os cabeçalhos corretos.
 */
export async function ensureMemberTab(tabName: string): Promise<void> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  })

  const existingTitles = (meta.data.sheets ?? []).map(s => s.properties?.title ?? '')

  if (existingTitles.includes(tabName)) return  // aba já existe — não modifica

  // Aba nova: cria e adiciona cabeçalhos
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheet(tabName)}!A1:T1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  })
}

/** Registra uma prospecção na aba do membro. Retorna o número da linha inserida. */
export async function appendProspection(
  memberTab: string,
  record: ProspectionRecord
): Promise<number> {
  const sheets = getSheets()
  const spreadsheetId = getSpreadsheetId()

  const now = new Date()
  const dataConexao = now.toLocaleDateString('pt-BR')
  const mes = now.toLocaleString('pt-BR', { month: 'long' })

  // 20 colunas (A:T). Preenche o que o sistema conhece; resto fica em branco
  // para o membro preencher manualmente na planilha.
  const row = new Array(20).fill('')
  row[COL.alvo]           = ''                          // A — preenchido manualmente
  row[COL.mes]            = mes                         // B
  row[COL.canal]          = sanitize(record.canal)      // C
  row[COL.setor]          = sanitize(record.setor ?? '') // D
  row[COL.empresa]        = sanitize(record.empresa)    // E
  row[COL.nome]           = sanitize(record.nome)       // F
  row[COL.contato]        = sanitize(record.contato ?? '') // G
  row[COL.quem_respondeu] = ''                          // H — preenchido manualmente
  row[COL.data_conexao]   = dataConexao                 // I
  // J–T permanecem '' (preenchimento manual)

  // Encontra a última linha com empresa preenchida (ignora linhas vazias e com
  // apenas formatação, que fariam o values.append pular para row 1000+).
  const colRes = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheet(memberTab)}!E:E`,   // col E = Empresa contatada
  }))
  const colValues = colRes.data.values ?? []
  let lastDataRow = 2  // fallback: linha 2 (legenda) → escreve na linha 3
  for (let i = colValues.length - 1; i >= 0; i--) {
    const val = colValues[i]?.[0]
    // Ignora cabeçalho e células vazias; considera qualquer outro valor como dado real
    if (val && typeof val === 'string' && val.trim() && val.trim() !== 'Empresa contatada') {
      lastDataRow = i + 1   // colValues é 0-based a partir da linha 1 da planilha
      break
    }
  }
  const targetRow = Math.max(3, lastDataRow + 1)  // nunca antes da linha 3

  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheet(memberTab)}!A${targetRow}:T${targetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  }))

  return targetRow
}

/**
 * Marca a coluna "Quem respondeu?" (H) quando o sistema detecta uma resposta.
 * As demais transições de status (RD, RP, Contrato) são preenchidas
 * manualmente pelo membro diretamente na planilha.
 */
export async function updateProspectionStatus(
  memberTab: string,
  rowIndex: number,
  status: string,
  _dataResposta?: string
): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = getSpreadsheetId()

  await withRetry(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [{
        range: `${quoteSheet(memberTab)}!H${rowIndex}`,
        values: [[status]],
      }],
    },
  }))
}

/** Busca prospecções recentes da aba de um membro (mais recente primeiro). */
export async function getRecentProspections(
  memberTab: string,
  limit = 10
): Promise<Array<{ rowIndex: number } & ProspectionRecord & { status: string; dataEnvio: string }>> {
  const sheets = getSheets()
  const spreadsheetId = getSpreadsheetId()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheet(memberTab)}!A2:T`,
  })

  const rows = (res.data.values ?? []) as string[][]
  const result = []

  // Itera de baixo para cima coletando até `limit` linhas REAIS.
  // Não usa janela fixa de índices — garante que leads reais sejam
  // encontrados mesmo havendo centenas de linhas vazias no meio.
  const isPositive = (v: string) => /^(sim|yes)$/i.test(v.trim()) || /^\d/.test(v.trim())

  for (let i = rows.length - 1; i >= 0 && result.length < limit; i--) {
    const row = rows[i]

    // Pula linha de legenda (col I = texto não-numérico, ex: "DD/MM/AAAA")
    const dataConexaoRaw = row[COL.data_conexao] ?? ''
    if (dataConexaoRaw && !/^\d/.test(dataConexaoRaw)) continue

    // Pula linhas completamente vazias (sem nome e sem empresa)
    if (!row[COL.nome] && !row[COL.empresa]) continue

    const quemRespondeu = row[COL.quem_respondeu] ?? ''
    const marcouRd      = row[10] ?? ''  // K — Marcou RD?
    const marcouRp      = row[14] ?? ''  // O — Marcou RP?
    const contrato      = row[16] ?? ''  // Q — Contrato?

    let status = 'Aguardando'
    if (isPositive(contrato))      status = 'Reunião'
    else if (isPositive(marcouRp)) status = 'Follow-up'
    else if (isPositive(marcouRd)) status = 'Reunião'
    else if (quemRespondeu)        status = 'Respondeu'

    result.push({
      rowIndex:  i + 2,  // i é 0-based a partir de A2, então +2 = linha real na planilha
      dataEnvio: row[COL.data_conexao] ?? '',
      canal:     (row[COL.canal] ?? 'Email') as 'Email' | 'LinkedIn',
      empresa:   row[COL.empresa] ?? '',
      setor:     row[COL.setor] ?? '',
      nome:      row[COL.nome] ?? '',
      contato:   row[COL.contato] ?? '',
      status,
    })
  }

  return result
}

/** Retorna o sheetId (gid) de uma aba pelo nome. */
export async function getSheetGid(tabName: string): Promise<number> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  }))
  const sheet = (meta.data.sheets ?? []).find(s => s.properties?.title === tabName)
  return sheet?.properties?.sheetId ?? 0
}

/**
 * Retorna as abas de membros que existem na planilha.
 * Usa MEMBER_TABS como whitelist — abas de sistema (KPIs, RDs, Prospecções,
 * etc.) são automaticamente excluídas por não estarem na lista.
 */
export async function getDynamicMemberTabs(): Promise<string[]> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  }))
  const existing = new Set(
    (meta.data.sheets ?? []).map(s => s.properties?.title ?? '').filter(Boolean)
  )
  return MEMBER_TABS.filter(tab => existing.has(tab))
}

/**
 * Busca prospecções de todos os membros (para visão do gerente/líder).
 * Retorna as entradas com um campo extra `memberTab` para identificar o membro.
 */
export async function getAllMembersProspections(
  limit = 20
): Promise<Array<{ rowIndex: number; memberTab: string } & ProspectionRecord & { status: string; dataEnvio: string }>> {
  const members = await getDynamicMemberTabs()
  const results = await Promise.all(
    members.map(async tab => {
      const rows = await getRecentProspections(tab, limit).catch(() => [])
      return rows.map(r => ({ ...r, memberTab: tab }))
    })
  )
  return results
    .flat()
    .sort((a, b) => {
      const toSortable = (d: string) => d.split('/').reverse().join('') || '0'
      return toSortable(b.dataEnvio).localeCompare(toSortable(a.dataEnvio))
    })
    .slice(0, limit * members.length)
}

// ─── Log de uso ──────────────────────────────────────────────────────────────

const LOG_TAB = '📊 Log'
const LOG_HEADERS = ['Data/Hora', 'Membro', 'Ação', 'Tokens Input', 'Tokens Output', 'Custo (USD)']

// Custo por token (claude-sonnet-4-5)
const COST_INPUT_PER_TOKEN  = 3    / 1_000_000  // $3/MTok
const COST_OUTPUT_PER_TOKEN = 15   / 1_000_000  // $15/MTok

let logTabEnsured = false

async function ensureLogTab(): Promise<void> {
  if (logTabEnsured) return
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === LOG_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: LOG_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LOG_TAB}'!A1:F1`,
      valueInputOption: 'RAW',
      requestBody: { values: [LOG_HEADERS] },
    })
  }
  logTabEnsured = true
}

export async function logUsage(entry: {
  memberTab: string
  acao: string
  tokensInput?: number
  tokensOutput?: number
}): Promise<void> {
  try {
    await ensureLogTab()
    const spreadsheetId = getSpreadsheetId()
    const sheets = getSheets()
    const custo = (
      (entry.tokensInput  ?? 0) * COST_INPUT_PER_TOKEN +
      (entry.tokensOutput ?? 0) * COST_OUTPUT_PER_TOKEN
    ).toFixed(6)

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    await withRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${LOG_TAB}'!A:F`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[now, entry.memberTab, entry.acao, entry.tokensInput ?? 0, entry.tokensOutput ?? 0, custo]] },
    }))
  } catch (err) {
    // Fire-and-forget — não quebra a operação principal
    console.error('[sheets] logUsage failed:', err)
  }
}

export type UsageLog = {
  dataHora: string
  memberTab: string
  acao: string
  tokensInput: number
  tokensOutput: number
  custo: number
}

export async function getUsageLogs(days = 30): Promise<UsageLog[]> {
  try {
    await ensureLogTab()
    const spreadsheetId = getSpreadsheetId()
    const sheets = getSheets()
    const res = await withRetry(() => sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${LOG_TAB}'!A2:F`,
    }))
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return (res.data.values ?? []).map(row => ({
      dataHora:     row[0] ?? '',
      memberTab:    row[1] ?? '',
      acao:         row[2] ?? '',
      tokensInput:  Number(row[3]) || 0,
      tokensOutput: Number(row[4]) || 0,
      custo:        Number(row[5]) || 0,
    }))
  } catch {
    return []
  }
}

/**
 * Busca todas as prospecções de um membro e tenta casar com um email enviado
 * baseado em nome + empresa. Retorna o rowIndex se encontrar.
 */
export async function findProspectionByContact(
  memberTab: string,
  nome: string,
  empresa: string
): Promise<number | null> {
  const sheets = getSheets()
  const spreadsheetId = getSpreadsheetId()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheet(memberTab)}!A2:T`,
  })

  const rows = (res.data.values ?? []) as string[][]
  const nomeLower    = nome.toLowerCase()
  const empresaLower = empresa.toLowerCase()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNome    = (row[COL.nome]    ?? '').toLowerCase()
    const rowEmpresa = (row[COL.empresa] ?? '').toLowerCase()
    if (rowNome.includes(nomeLower) && rowEmpresa.includes(empresaLower)) {
      return i + 2
    }
  }

  return null
}

// ─── Qualificação de leads ────────────────────────────────────────────────────

const QUALIFIED_TAB = '🎯 Qualificados'
const QUALIFIED_HEADERS = [
  'Data', 'Empresa', 'Setor', 'Contato', 'Cargo',
  'BANT Score', 'ICE Score', 'Score Final', 'Classificação', 'Veredicto IA', 'Qualificado por',
]

async function ensureQualifiedTab(): Promise<void> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }))
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === QUALIFIED_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: QUALIFIED_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${QUALIFIED_TAB}'!A1:K1`,
      valueInputOption: 'RAW',
      requestBody: { values: [QUALIFIED_HEADERS] },
    })
  }
}

export async function saveQualifiedLead(params: {
  empresa: string
  setor: string
  contato: string
  cargo: string
  bantScore: number
  iceScore: number
  scoreFinal: number
  classificacao: string
  veredictoIa: string
  memberTab: string
}): Promise<void> {
  await ensureQualifiedTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const now = new Date().toLocaleDateString('pt-BR')
  const row = [
    now,
    sanitize(params.empresa),
    sanitize(params.setor),
    sanitize(params.contato),
    sanitize(params.cargo),
    params.bantScore,
    params.iceScore.toFixed(1),
    params.scoreFinal,
    params.classificacao,
    sanitize(params.veredictoIa),
    sanitize(params.memberTab),
  ]

  // Verifica se empresa já existe — atualiza em vez de duplicar
  const colRes = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${QUALIFIED_TAB}'!B:B`,
  }))
  const colValues = colRes.data.values ?? []
  const empresaLower = params.empresa.toLowerCase().trim()

  let existingRow = -1
  for (let i = 1; i < colValues.length; i++) {
    if ((colValues[i]?.[0] ?? '').toLowerCase().trim() === empresaLower) {
      existingRow = i + 1
      break
    }
  }

  if (existingRow > 1) {
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${QUALIFIED_TAB}'!A${existingRow}:K${existingRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    }))
  } else {
    let lastDataRow = 1
    for (let i = colValues.length - 1; i >= 1; i--) {
      if (colValues[i]?.[0]) { lastDataRow = i + 1; break }
    }
    const targetRow = Math.max(2, lastDataRow + 1)
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${QUALIFIED_TAB}'!A${targetRow}:K${targetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    }))
  }
}

// ─── Pipeline de descoberta de leads ─────────────────────────────────────────

const DISCOVERED_TAB = '🔍 Descobertos'
const DISCOVERED_HEADERS = [
  'Data Descoberta', 'Empresa', 'CNPJ', 'Setor', 'Porte', 'Cidade',
  'Email', 'Telefone', 'LinkedIn URL', 'Funcionários', 'Decisores',
  'Potencial IA', 'Dores Típicas', 'Serviços Sugeridos', 'Argumento de Abertura', 'Status',
]

async function ensureDiscoveredTab(): Promise<void> {
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }))
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === DISCOVERED_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: DISCOVERED_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${DISCOVERED_TAB}'!A1:P1`,
      valueInputOption: 'RAW',
      requestBody: { values: [DISCOVERED_HEADERS] },
    })
  }
}

export interface DiscoveredLeadRecord {
  empresa:            string
  cnpj:               string
  setor:              string
  porte:              string
  cidade:             string
  email?:             string | null
  telefone?:          string | null
  linkedin_url?:      string | null
  funcionarios?:      number | null
  decisores?:         string[]
  potencial?:         string | null
  dores_tipicas?:     string[]
  servicos_sugeridos?: string[]
  argumento_abertura?: string | null
  status?:            string
}

// ─── Agente autônomo ──────────────────────────────────────────────────────────

const AGENT_TAB = 'Leads Agente'
const AGENT_HEADERS = [
  'Data', 'Empresa', 'CNPJ', 'Setor', 'Porte', 'Cidade',
  'Email', 'Telefone', 'LinkedIn Empresa', 'Decisores', 'Emails Encontrados',
  'Potencial IA', 'Justificativa', 'Dores Típicas', 'Serviços Sugeridos',
  'Argumento de Abertura', 'Status', 'Membro',
]

let agentTabEnsured = false

async function ensureAgentTab(): Promise<void> {
  if (agentTabEnsured) return
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }))
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === AGENT_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: AGENT_TAB } } }] },
    })
  }
  // Sempre atualiza os cabeçalhos para refletir o schema atual
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${AGENT_TAB}'!A1:R1`,
    valueInputOption: 'RAW',
    requestBody: { values: [AGENT_HEADERS] },
  }))
  agentTabEnsured = true
}

export async function saveAgentLead(params: {
  empresa:             string
  cnpj?:               string | null
  setor:               string
  porte?:              string | null
  cidade:              string
  email?:              string | null
  telefone?:           string | null
  linkedin_url?:       string | null
  decision_makers?:    { name: string; role: string; profile_url: string | null }[]
  potencial?:          string | null
  justificativa?:      string | null
  dores_tipicas?:      string[]
  servicos_sugeridos?: string[]
  argumento_abertura?: string | null
  emails_encontrados?: string[]
  status?:             string
  memberTab:           string
}): Promise<void> {
  await ensureAgentTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const now = new Date().toLocaleDateString('pt-BR')

  const decisoresStr = (params.decision_makers ?? [])
    .map(dm => `${dm.name} (${dm.role})${dm.profile_url ? ' — ' + dm.profile_url.replace('https://', '') : ''}`)
    .join('\n')

  const row = [
    now,
    sanitize(params.empresa),
    sanitize(params.cnpj               ?? ''),
    sanitize(params.setor),
    sanitize(params.porte              ?? ''),
    sanitize(params.cidade),
    sanitize(params.email              ?? ''),
    sanitize(params.telefone           ?? ''),
    sanitize(params.linkedin_url       ?? ''),
    decisoresStr,
    sanitize((params.emails_encontrados ?? []).join('; ')),
    sanitize(params.potencial          ?? ''),
    sanitize(params.justificativa      ?? ''),
    sanitize((params.dores_tipicas      ?? []).join('; ')),
    sanitize((params.servicos_sugeridos ?? []).join('; ')),
    sanitize(params.argumento_abertura ?? ''),
    sanitize(params.status             ?? 'Descoberto pelo Agente'),
    sanitize(params.memberTab),
  ]

  // Deduplicação: por CNPJ (col C) se disponível; por LinkedIn URL (col I) como fallback
  const batchRes = await withRetry(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [`'${AGENT_TAB}'!C:C`, `'${AGENT_TAB}'!I:I`],
  }))
  const cnpjValues = batchRes.data.valueRanges?.[0]?.values ?? []
  const urlValues  = batchRes.data.valueRanges?.[1]?.values ?? []

  const cnpjDigits  = (params.cnpj ?? '').replace(/\D/g, '')
  const linkedinUrl = (params.linkedin_url ?? '').trim()

  let existingRow = -1
  for (let i = 1; i < Math.max(cnpjValues.length, urlValues.length); i++) {
    const rowCnpj = (cnpjValues[i]?.[0] ?? '').replace(/\D/g, '')
    const rowUrl  = (urlValues[i]?.[0]  ?? '').trim()
    if (cnpjDigits && rowCnpj === cnpjDigits) { existingRow = i + 1; break }
    if (!cnpjDigits && linkedinUrl && rowUrl === linkedinUrl) { existingRow = i + 1; break }
  }

  if (existingRow > 1) {
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${AGENT_TAB}'!A${existingRow}:R${existingRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    }))
  } else {
    const lastRow = Math.max(cnpjValues.length, urlValues.length, 1)
    const targetRow = Math.max(2, lastRow + 1)
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${AGENT_TAB}'!A${targetRow}:R${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    }))
  }
}

// ─── Apollo.io lead pipeline ──────────────────────────────────────────────────

const APOLLO_TAB = 'Leads Apollo'
const APOLLO_HEADERS = [
  'Data',           // A
  'Empresa',        // B
  'Website',        // C
  'Setor',          // D
  'Porte',          // E
  'Funcionários',   // F
  'Localização',    // G
  'Email',          // H
  'Telefone',       // I
  'LinkedIn Empresa', // J
  'Apollo URL',     // K
  'Decisores',      // L
  'Emails Encontrados', // M
  'CNPJ',           // N
  'Potencial IA',   // O
  'Justificativa',  // P
  'Dores Típicas',  // Q
  'Serviços Sugeridos', // R
  'Argumento de Abertura', // S
  'Score Fit',      // T
  'Resumo do Site', // U
  'Contato Principal', // V
  'Cargo Principal', // W
  'Email Principal', // X
  'Status',         // Y
  'Membro',         // Z
]

let apolloTabEnsured = false

async function ensureApolloTab(): Promise<void> {
  if (apolloTabEnsured) return
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }))
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === APOLLO_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: APOLLO_TAB } } }] },
    })
  }
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${APOLLO_TAB}'!A1:Z1`,
    valueInputOption: 'RAW',
    requestBody: { values: [APOLLO_HEADERS] },
  }))
  apolloTabEnsured = true
}

export async function saveApolloLead(params: {
  empresa:             string
  website?:            string | null
  setor?:              string | null
  porte?:              string | null
  funcionarios?:       string | null
  cidade?:             string | null
  email?:              string | null
  telefone?:           string | null
  linkedin_url?:       string | null
  apollo_url?:         string | null
  decision_makers?:    { name: string; role: string; profile_url: string | null }[]
  emails_encontrados?: string[]
  cnpj?:               string | null
  potencial?:          string | null
  justificativa?:      string | null
  dores_tipicas?:      string[]
  servicos_sugeridos?: string[]
  argumento_abertura?: string | null
  score_fit?:          number | null
  resumo_site?:        string | null
  status?:             string
  memberTab:           string
}): Promise<void> {
  await ensureApolloTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const now = new Date().toLocaleDateString('pt-BR')

  const decisoresStr = (params.decision_makers ?? [])
    .map(dm => `${dm.name} (${dm.role})${dm.profile_url ? ' — ' + dm.profile_url.replace('https://', '') : ''}`)
    .join('\n')

  const firstDm    = params.decision_makers?.[0]
  const firstEmail = params.emails_encontrados?.[0] ?? params.email ?? ''

  const row = [
    now,
    sanitize(params.empresa),
    sanitize(params.website            ?? ''),
    sanitize(params.setor              ?? ''),
    sanitize(params.porte              ?? ''),
    sanitize(params.funcionarios       ?? ''),
    sanitize(params.cidade             ?? ''),
    sanitize(params.email              ?? ''),
    sanitize(params.telefone           ?? ''),
    sanitize(params.linkedin_url       ?? ''),
    sanitize(params.apollo_url         ?? ''),
    decisoresStr,
    sanitize((params.emails_encontrados ?? []).join('; ')),
    sanitize(params.cnpj               ?? ''),
    sanitize(params.potencial          ?? ''),
    sanitize(params.justificativa      ?? ''),
    sanitize((params.dores_tipicas      ?? []).join('; ')),
    sanitize((params.servicos_sugeridos ?? []).join('; ')),
    sanitize(params.argumento_abertura ?? ''),
    params.score_fit != null ? String(params.score_fit) : '',
    sanitize((params.resumo_site ?? '').slice(0, 300)),
    sanitize(firstDm?.name             ?? ''),
    sanitize(firstDm?.role             ?? ''),
    sanitize(firstEmail),
    sanitize(params.status             ?? 'Descoberto pelo Apollo'),
    sanitize(params.memberTab),
  ]

  // Dedup by website (col C) or apollo_url (col K)
  const batchRes = await withRetry(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [`'${APOLLO_TAB}'!C:C`, `'${APOLLO_TAB}'!K:K`],
  }))
  const websiteValues = batchRes.data.valueRanges?.[0]?.values ?? []
  const apolloValues  = batchRes.data.valueRanges?.[1]?.values ?? []

  const website   = (params.website    ?? '').trim().replace(/\/+$/, '').toLowerCase()
  const apolloUrl = (params.apollo_url ?? '').trim()

  let existingRow = -1
  for (let i = 1; i < Math.max(websiteValues.length, apolloValues.length); i++) {
    const rowSite   = (websiteValues[i]?.[0] ?? '').trim().replace(/\/+$/, '').toLowerCase()
    const rowApollo = (apolloValues[i]?.[0]  ?? '').trim()
    if (website   && rowSite   === website)   { existingRow = i + 1; break }
    if (apolloUrl && rowApollo === apolloUrl) { existingRow = i + 1; break }
  }

  if (existingRow > 1) {
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${APOLLO_TAB}'!A${existingRow}:Z${existingRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    }))
  } else {
    const lastRow = Math.max(websiteValues.length, apolloValues.length, 1)
    const targetRow = Math.max(2, lastRow + 1)
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${APOLLO_TAB}'!A${targetRow}:Z${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    }))
  }
}

export async function saveDiscoveredLead(lead: DiscoveredLeadRecord): Promise<void> {
  await ensureDiscoveredTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const now = new Date().toLocaleDateString('pt-BR')
  const row = [
    now,
    sanitize(lead.empresa),
    sanitize(lead.cnpj),
    sanitize(lead.setor),
    sanitize(lead.porte),
    sanitize(lead.cidade),
    sanitize(lead.email ?? ''),
    sanitize(lead.telefone ?? ''),
    sanitize(lead.linkedin_url ?? ''),
    lead.funcionarios ?? '',
    sanitize((lead.decisores ?? []).join('; ')),
    sanitize(lead.potencial ?? ''),
    sanitize((lead.dores_tipicas ?? []).join('; ')),
    sanitize((lead.servicos_sugeridos ?? []).join('; ')),
    sanitize(lead.argumento_abertura ?? ''),
    sanitize(lead.status ?? 'Descoberto'),
  ]

  // Verifica se CNPJ já existe (coluna C) — atualiza em vez de duplicar
  const colRes = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${DISCOVERED_TAB}'!C:C`,
  }))
  const colValues = colRes.data.values ?? []
  const cnpjDigits = lead.cnpj.replace(/\D/g, '')

  let existingRow = -1
  for (let i = 1; i < colValues.length; i++) {
    if ((colValues[i]?.[0] ?? '').replace(/\D/g, '') === cnpjDigits) {
      existingRow = i + 1
      break
    }
  }

  if (existingRow > 1) {
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${DISCOVERED_TAB}'!A${existingRow}:P${existingRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    }))
  } else {
    let lastDataRow = 1
    for (let i = colValues.length - 1; i >= 1; i--) {
      if (colValues[i]?.[0]) { lastDataRow = i + 1; break }
    }
    const targetRow = Math.max(2, lastDataRow + 1)
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${DISCOVERED_TAB}'!A${targetRow}:P${targetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    }))
  }
}

// ── Google Maps Leads ─────────────────────────────────────────────────────────

const MAPS_TAB = 'Leads Maps'
const MAPS_HEADERS = [
  'Data', 'Empresa', 'Setor', 'Cidade', 'Endereço',
  'Telefone BR', 'Telefone Internacional', 'Site', 'Horário',
  'Potencial IA', 'Justificativa', 'Dores Típicas', 'Serviços Sugeridos',
  'Melhor Canal', 'Melhor Horário', 'Argumento de Abertura', 'Status', 'Membro',
]

let mapsTabEnsured = false

async function ensureMapsTab(): Promise<void> {
  if (mapsTabEnsured) return
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }))
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === MAPS_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: MAPS_TAB } } }] },
    })
  }
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${MAPS_TAB}'!A1:R1`,
    valueInputOption: 'RAW',
    requestBody: { values: [MAPS_HEADERS] },
  }))
  mapsTabEnsured = true
}

export async function saveMapLead(params: {
  empresa:            string
  setor:              string
  cidade:             string
  endereco:           string
  telefone_br:        string | null
  telefone_intl:      string | null
  site:               string | null
  horario:            string | null
  potencial:          string | null
  justificativa:      string | null
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  melhor_canal:       string | null
  melhor_horario:     string | null
  argumento_abertura: string | null
  memberTab:          string
}): Promise<number> {
  await ensureMapsTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const now = new Date().toLocaleDateString('pt-BR')
  const row = [
    now,
    sanitize(params.empresa),
    sanitize(params.setor),
    sanitize(params.cidade),
    sanitize(params.endereco),
    params.telefone_br        ?? '',
    params.telefone_intl      ?? '',
    params.site               ?? '',
    params.horario            ?? '',
    sanitize(params.potencial          ?? ''),
    sanitize(params.justificativa      ?? ''),
    (params.dores_tipicas      ?? []).join('; '),
    (params.servicos_sugeridos ?? []).join('; '),
    params.melhor_canal       ?? '',
    params.melhor_horario     ?? '',
    sanitize(params.argumento_abertura ?? ''),
    'Novo',
    sanitize(params.memberTab),
  ]

  // Dedup by empresa + cidade (cols B and D)
  const batchRes = await withRetry(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [`'${MAPS_TAB}'!B:B`, `'${MAPS_TAB}'!D:D`],
  }))
  const nomes   = batchRes.data.valueRanges?.[0]?.values ?? []
  const cidades = batchRes.data.valueRanges?.[1]?.values ?? []

  const nomeLow   = params.empresa.toLowerCase().trim()
  const cidadeLow = params.cidade.toLowerCase().trim()

  let existingRow = -1
  for (let i = 1; i < Math.max(nomes.length, cidades.length); i++) {
    if (
      (nomes[i]?.[0] ?? '').toLowerCase().trim() === nomeLow &&
      (cidades[i]?.[0] ?? '').toLowerCase().trim() === cidadeLow
    ) {
      existingRow = i + 1
      break
    }
  }

  if (existingRow > 1) {
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${MAPS_TAB}'!A${existingRow}:R${existingRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    }))
    return existingRow
  }

  const lastRow = Math.max(nomes.length, cidades.length, 1)
  const targetRow = Math.max(2, lastRow + 1)
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${MAPS_TAB}'!A${targetRow}:R${targetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  }))
  return targetRow
}

// ── Maps API Usage Tracking ───────────────────────────────────────────────────

const MAPS_USAGE_TAB = 'Maps Usage'
const MAPS_USAGE_HEADERS = [
  'Data', 'Mês/Ano', 'Tipo Chamada', 'Custo Estimado USD', 'Custo Acumulado Mês', 'Empresa Pesquisada', 'Membro',
]

let mapsUsageTabEnsured = false

async function ensureMapsUsageTab(): Promise<void> {
  if (mapsUsageTabEnsured) return
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }))
  const exists = (meta.data.sheets ?? []).some(s => s.properties?.title === MAPS_USAGE_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: MAPS_USAGE_TAB } } }] },
    })
  }
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${MAPS_USAGE_TAB}'!A1:G1`,
    valueInputOption: 'RAW',
    requestBody: { values: [MAPS_USAGE_HEADERS] },
  }))
  mapsUsageTabEnsured = true
}

export async function logMapsApiCall(
  type: 'text_search' | 'place_details',
  companyName: string,
  member: string,
  accumulatedCost: number,
): Promise<void> {
  await ensureMapsUsageTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const cost = type === 'text_search' ? 0.04 : 0.017
  const now = new Date()
  const monthYear = `${now.getMonth() + 1}/${now.getFullYear()}`

  await withRetry(() => sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${MAPS_USAGE_TAB}'!A:G`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        now.toISOString(),
        monthYear,
        type,
        cost.toFixed(4),
        accumulatedCost.toFixed(4),
        companyName,
        member,
      ]],
    },
  }))
}

export async function getMapsMonthlyUsage(): Promise<{
  textSearchCount:   number
  placeDetailsCount: number
  totalCost:         number
}> {
  await ensureMapsUsageTab()
  const spreadsheetId = getSpreadsheetId()
  const sheets = getSheets()

  const now = new Date()
  const monthYear = `${now.getMonth() + 1}/${now.getFullYear()}`

  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${MAPS_USAGE_TAB}'!A:E`,
  }))

  const rows: string[][] = (res.data.values ?? []) as string[][]
  let textSearchCount   = 0
  let placeDetailsCount = 0
  let totalCost         = 0

  for (const row of rows.slice(1)) {
    if (row[1] !== monthYear) continue
    const type = row[2] as 'text_search' | 'place_details'
    const cost = parseFloat(row[3] ?? '0')
    if (type === 'text_search')        textSearchCount++
    else if (type === 'place_details') placeDetailsCount++
    totalCost += cost
  }

  return { textSearchCount, placeDetailsCount, totalCost }
}
