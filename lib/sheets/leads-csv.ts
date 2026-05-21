import type { LeadCSV } from '@/lib/types/lead'
import { getSheets, getSpreadsheetId, withRetry } from './client'

const CSV_TAB  = 'Leads CSV'
const LAST_COL = 'T'

export type DecisoresStatus = 'ok' | 'pendente_enriquecimento' | 'sem_decisores'

export interface DecisoresInfo {
  decisores: Array<{ nome: string; url: string }>
  status:    DecisoresStatus
}

export function parseDecisoresInfo(raw: string): DecisoresInfo {
  const trimmed  = raw?.trim() ?? ''
  const decisores = parseDecisores(raw)

  let status: DecisoresStatus
  if (decisores.length > 0) {
    status = 'ok'
  } else if (trimmed === 'Novo') {
    status = 'pendente_enriquecimento'
  } else {
    status = 'sem_decisores'
  }

  return { decisores, status }
}

export function parseDecisores(raw: string): Array<{ nome: string; url: string }> {
  if (!raw?.trim()) return []

  // Processa linha a linha com três regras (em ordem de prioridade):
  //   1. linha tem " | "       → formato novo: "Nome | URL"
  //   2. linha começa com http → URL do nome legado anterior
  //   3. caso contrário        → nome legado (próxima linha http será a URL)
  const lines       = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const result: Array<{ nome: string; url: string }> = []
  let pendingName: string | null = null

  for (const line of lines) {
    const pipeSep = line.indexOf(' | ')
    const isNewFormat = pipeSep !== -1 && line.slice(pipeSep + 3).trimStart().startsWith('http')

    if (isNewFormat) {
      // Formato novo: "Nome | https://..."
      if (pendingName !== null) { result.push({ nome: pendingName, url: '' }); pendingName = null }
      result.push({ nome: line.slice(0, pipeSep).trim(), url: line.slice(pipeSep + 3).trim() })
    } else if (line.startsWith('http')) {
      // URL legada: emparelha com nome anterior
      if (pendingName !== null) { result.push({ nome: pendingName, url: line }); pendingName = null }
      // URL sem nome precedente: ignorada
    } else {
      // Nome legado (strip "— Cargo" se houver)
      if (pendingName !== null) result.push({ nome: pendingName, url: '' })
      const nome = line.replace(/\s*—.*$/, '').trim()
      pendingName = nome || null
    }
  }

  if (pendingName !== null) result.push({ nome: pendingName, url: '' })

  return result.filter(d => d.nome !== '' && d.nome !== 'Novo')
}

export function parseTentados(raw: string): number[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n))
}

function rowToLeadCSV(row: string[], rowIndex: number): LeadCSV {
  const c = (i: number) => row[i] ?? ''
  return {
    rowIndex,
    data:               c(0),
    empresa:            c(1),
    setor:              c(2),
    cidade:             c(3),
    funcionarios:       c(4),
    website:            c(5),
    linkedin_url:       c(6),
    telefone:           c(7),
    email:              c(8),
    potencial:          c(9),
    score_fit:          c(10),
    justificativa:      c(11),
    dores_tipicas:      c(12),
    servicos_sugeridos: c(13),
    melhor_canal:       c(14),
    argumento_abertura: c(15),
    decisores_linkedin: c(16),
    membro:             c(17),
    prospectado:        c(18),
    data_prospeccao:    c(19),
  }
}

export async function readLeadsCSV(): Promise<LeadCSV[]> {
  const sheets        = getSheets()
  const spreadsheetId = getSpreadsheetId()

  const res = await withRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${CSV_TAB}'!A:${LAST_COL}`,
    }),
  )

  const rows = (res.data.values ?? []) as string[][]
  return rows
    .slice(1)
    .map((row, i) => rowToLeadCSV(row, i + 2))
    .filter(lead => lead.empresa !== '')
}

export async function updateLeadsCSVRow(
  rowIndex: number,
  fields: Partial<Pick<LeadCSV, 'membro' | 'prospectado' | 'data_prospeccao'>>,
): Promise<void> {
  const sheets        = getSheets()
  const spreadsheetId = getSpreadsheetId()

  const updates: Array<{ range: string; values: string[][] }> = []

  if (fields.membro !== undefined) {
    updates.push({ range: `'${CSV_TAB}'!R${rowIndex}`, values: [[fields.membro]] })
  }
  if (fields.prospectado !== undefined) {
    updates.push({ range: `'${CSV_TAB}'!S${rowIndex}`, values: [[fields.prospectado]] })
  }
  if (fields.data_prospeccao !== undefined) {
    updates.push({ range: `'${CSV_TAB}'!T${rowIndex}`, values: [[fields.data_prospeccao]] })
  }

  if (updates.length === 0) return

  await withRetry(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data:             updates,
      },
    }),
  )
}
