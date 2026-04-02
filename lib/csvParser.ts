import Papa from 'papaparse'
import { Lead, ColumnMapping } from '@/types'
import { v4 as uuidv4 } from 'crypto'

const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  nome: ['first name', 'nome', 'first_name', 'firstname', 'name', 'primeiro nome'],
  sobrenome: ['last name', 'sobrenome', 'last_name', 'lastname', 'surname'],
  cargo: ['title', 'cargo', 'job title', 'position', 'role', 'função', 'funcao'],
  empresa: ['company', 'empresa', 'company name', 'organization', 'organização'],
  setor: ['industry', 'setor', 'sector', 'segmento', 'segment'],
  tamanho: ['# employees', 'employees', 'tamanho', 'size', 'num employees', 'funcionários'],
  cidade: ['city', 'cidade', 'location', 'localização', 'localizacao'],
  linkedin: ['linkedin url', 'linkedin', 'profile url', 'linkedin profile'],
  email: ['email', 'e-mail', 'email address', 'corporate email'],
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim())
  const mapping: Partial<ColumnMapping> = {}

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const found = normalizedHeaders.find(h => aliases.includes(h))
    if (found) {
      mapping[field as keyof ColumnMapping] = headers[normalizedHeaders.indexOf(found)]
    } else {
      mapping[field as keyof ColumnMapping] = ''
    }
  }

  return mapping as ColumnMapping
}

export function parseCSV(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || []
        const rows = results.data as Record<string, string>[]
        resolve({ headers, rows })
      },
      error: (error) => reject(error),
    })
  })
}

export function mapRowsToLeads(rows: Record<string, string>[], mapping: ColumnMapping): Lead[] {
  return rows.map((row) => ({
    id: Math.random().toString(36).substr(2, 9),
    nome: mapping.nome ? row[mapping.nome] || '' : '',
    sobrenome: mapping.sobrenome ? row[mapping.sobrenome] : undefined,
    cargo: mapping.cargo ? row[mapping.cargo] : undefined,
    empresa: mapping.empresa ? row[mapping.empresa] || '' : '',
    setor: mapping.setor ? row[mapping.setor] : undefined,
    tamanho: mapping.tamanho ? row[mapping.tamanho] : undefined,
    cidade: mapping.cidade ? row[mapping.cidade] : undefined,
    linkedin: mapping.linkedin ? row[mapping.linkedin] : undefined,
    email: mapping.email ? row[mapping.email] : undefined,
    status: 'pending' as const,
  }))
}

export function exportLeadsToCSV(leads: Lead[], originalRows: Record<string, string>[]): void {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
  
  const enrichedRows = originalRows.map((row, index) => {
    const lead = leads[index]
    return {
      ...row,
      mensagem_gerada: lead?.mensagem_gerada || '',
      avaliacao: lead?.avaliacao === 'up' ? '👍' : lead?.avaliacao === 'down' ? '👎' : '',
    }
  })

  const csv = Papa.unparse(enrichedRows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `prospectai_${date}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
