/** Parser CSV simples com suporte a campos quoted (RFC 4180). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = splitCsvLines(text)
  if (lines.length < 2) return []

  const headers = parseCsvRow(lines[0]).map(h => h.trim())
  const result: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCsvRow(line)
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? ''
    }
    result.push(row)
  }

  return result
}

function splitCsvLines(text: string): string[] {
  // Divide por \n respeitando campos quoted que contêm newlines
  const lines: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      inQuote = !inQuote
      current += ch
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      lines.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) lines.push(current)
  return lines
}

function parseCsvRow(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (ch === ',' && !inQuote) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

// ── Mapeamento de colunas Apollo → campos internos ────────────────────────────

function col(row: Record<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const val = row[c] ?? row[c.toLowerCase()] ?? ''
    if (val) return val.trim()
  }
  return ''
}

export interface ApolloRow {
  nome_empresa:     string
  setor:            string
  porte:            string
  cidade:           string
  estado:           string
  site:             string
  linkedin_empresa: string
  nome_decisor:     string
  cargo_decisor:    string
  linkedin_decisor: string
  email_decisor:    string
  telefone_decisor: string
}

export function mapApolloRow(row: Record<string, string>): ApolloRow {
  const firstName = col(row, 'First Name', 'first_name')
  const lastName  = col(row, 'Last Name',  'last_name')
  const fullName  = col(row, 'Person Name', 'Contact Name', 'Name') ||
    [firstName, lastName].filter(Boolean).join(' ')

  return {
    nome_empresa:     col(row, 'Company', 'Company Name', 'Account Name'),
    setor:            col(row, 'Industry', 'Sector'),
    porte:            col(row, 'Company Size', '# Employees', 'Employees', 'Number of Employees'),
    cidade:           col(row, 'City', 'Company City'),
    estado:           col(row, 'State', 'Company State'),
    site:             col(row, 'Website', 'Company Domain', 'Company Website'),
    linkedin_empresa: col(row, 'Company Linkedin Url', 'Company LinkedIn Url', 'Company LinkedIn URL'),
    nome_decisor:     fullName,
    cargo_decisor:    col(row, 'Title', 'Job Title', 'Position'),
    linkedin_decisor: col(row, 'LinkedIn Url', 'Person Linkedin Url', 'Person LinkedIn URL'),
    email_decisor:    col(row, 'Email', 'Corporate Email', 'Email Address'),
    telefone_decisor: col(row, 'Phone Number', 'Direct Phone Number', 'Phone'),
  }
}
