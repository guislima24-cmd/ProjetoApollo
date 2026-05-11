import { createHash } from 'crypto'
import { getMapsMemoryEntry, upsertMapsMemoryEntry, getRecentMapsLeads, MapsMemoryEntry } from '@/lib/sheets'

export const REVALIDATION_DAYS = 60
export const MAX_PAGES         = 5

export type { MapsMemoryEntry as FilterMemory }

export function getFilterHash(setor: string, cidade: string): string {
  const normalized = `${setor.toLowerCase().trim()}|${cidade.toLowerCase().trim()}`
  return createHash('sha1').update(normalized).digest('hex')
}

export async function loadRecentLeadsSet(): Promise<Set<string>> {
  const leads = await getRecentMapsLeads(REVALIDATION_DAYS)
  const set = new Set<string>()
  for (const lead of leads) {
    if (!lead.empresa || !lead.cidade) continue
    set.add(`${lead.empresa.toLowerCase().trim()}|${lead.cidade.toLowerCase().trim()}`)
  }
  return set
}

export function isDuplicate(nome: string, cidade: string, recentSet: Set<string>): boolean {
  return recentSet.has(`${nome.toLowerCase().trim()}|${cidade.toLowerCase().trim()}`)
}

export async function getFilterMemory(setor: string, cidade: string): Promise<MapsMemoryEntry | null> {
  const hash  = getFilterHash(setor, cidade)
  const entry = await getMapsMemoryEntry(hash)
  if (!entry) return null

  // Reset offset when revalidation window has passed
  if (entry.lastSearch) {
    const daysSince = (Date.now() - new Date(entry.lastSearch).getTime()) / 86_400_000
    if (daysSince >= REVALIDATION_DAYS) return { ...entry, lastOffset: 0 }
  }

  return entry
}

export async function updateFilterMemory(
  setor:        string,
  cidade:       string,
  totalScanned: number,
  addedCount:   number,
  memberTab:    string,
  prev:         MapsMemoryEntry | null,
): Promise<void> {
  const hash = getFilterHash(setor, cidade)
  await upsertMapsMemoryEntry({
    hash,
    setor,
    cidade,
    lastOffset:     totalScanned,
    lastSearch:     new Date().toISOString(),
    totalCollected: (prev?.totalCollected ?? 0) + addedCount,
    memberTab,
  })
}
