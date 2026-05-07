import { logMapsApiCall, getMapsMonthlyUsage } from '@/lib/sheets'

export const TEXT_SEARCH_COST   = 0.04
export const PLACE_DETAILS_COST = 0.017

const SAFE_LIMIT_USD    = Number(process.env.MAPS_SAFE_LIMIT_USD    ?? 150)
const WARNING_LIMIT_USD = Number(process.env.MAPS_WARNING_LIMIT_USD ?? 100)

export interface MonthlyUsage {
  totalCalls:       number
  totalCost:        number
  percentUsed:      number
  callsByType:      { text_search: number; place_details: number }
  daysUntilReset:   number
  limit:            number
  warning:          boolean
  blocked:          boolean
  apiKeyConfigured: boolean
}

let usageCache: { value: MonthlyUsage; updatedAt: number } | null = null
const CACHE_TTL_MS = 30_000

function daysUntilMonthReset(): number {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export async function getMonthlyUsage(): Promise<MonthlyUsage> {
  const now = Date.now()
  if (usageCache && now - usageCache.updatedAt < CACHE_TTL_MS) return usageCache.value

  let textSearchCount   = 0
  let placeDetailsCount = 0
  let totalCost         = 0

  try {
    const data = await getMapsMonthlyUsage()
    textSearchCount   = data.textSearchCount
    placeDetailsCount = data.placeDetailsCount
    totalCost         = data.totalCost
  } catch (err) {
    console.error('[MAPS_USAGE] Falha ao ler Sheets:', err)
  }

  const result: MonthlyUsage = {
    totalCalls:  textSearchCount + placeDetailsCount,
    totalCost,
    percentUsed: SAFE_LIMIT_USD > 0 ? (totalCost / SAFE_LIMIT_USD) * 100 : 0,
    callsByType: { text_search: textSearchCount, place_details: placeDetailsCount },
    daysUntilReset: daysUntilMonthReset(),
    limit:       SAFE_LIMIT_USD,
    warning:     totalCost >= WARNING_LIMIT_USD,
    blocked:     totalCost >= SAFE_LIMIT_USD,
    apiKeyConfigured: !!process.env.GOOGLE_PLACES_API_KEY,
  }

  usageCache = { value: result, updatedAt: Date.now() }
  return result
}

export async function logApiCall(
  type: 'text_search' | 'place_details',
  companyName: string,
  member: string,
): Promise<void> {
  const cost = type === 'text_search' ? TEXT_SEARCH_COST : PLACE_DETAILS_COST

  // Update cache optimistically so next canMakeCall sees updated usage
  if (usageCache) {
    const u = usageCache.value
    u.totalCalls       += 1
    u.totalCost        += cost
    u.callsByType[type] += 1
    u.percentUsed = SAFE_LIMIT_USD > 0 ? (u.totalCost / SAFE_LIMIT_USD) * 100 : 0
    u.blocked  = u.totalCost >= SAFE_LIMIT_USD
    u.warning  = u.totalCost >= WARNING_LIMIT_USD
  }

  const accumulatedCost = usageCache?.value.totalCost ?? cost
  // Non-blocking — a failure here does not stop the main flow
  logMapsApiCall(type, companyName, member, accumulatedCost).catch(err =>
    console.error('[MAPS_USAGE] Falha ao logar (não crítico):', err)
  )
}

export async function canMakeCall(estimatedCost = TEXT_SEARCH_COST): Promise<{
  allowed:      boolean
  reason:       string
  currentUsage: number
  limit:        number
}> {
  const usage     = await getMonthlyUsage()
  const projected = usage.totalCost + estimatedCost

  if (projected >= SAFE_LIMIT_USD) {
    return {
      allowed: false,
      reason: 'limite_seguranca_atingido',
      currentUsage: usage.totalCost,
      limit: SAFE_LIMIT_USD,
    }
  }
  return { allowed: true, reason: 'ok', currentUsage: usage.totalCost, limit: SAFE_LIMIT_USD }
}
