export interface EmailResult {
  email:      string
  confidence: number
  source:     string
}

export async function findEmailsForAgent(domain: string): Promise<EmailResult[]> {
  const apiKey = process.env.HUNTER_IO_API_KEY
  if (!apiKey || !domain) return []

  try {
    const url = new URL('https://api.hunter.io/v2/domain-search')
    url.searchParams.set('domain',  domain)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('limit',   '5')

    const res = await fetch(url.toString())
    if (!res.ok) return []

    const data = await res.json() as {
      data?: {
        emails?: Array<{
          value:      string
          confidence: number
          sources?:   { uri: string }[]
        }>
      }
    }

    return (data.data?.emails ?? []).map(e => ({
      email:      e.value,
      confidence: e.confidence,
      source:     e.sources?.[0]?.uri ?? '',
    }))
  } catch {
    return []
  }
}

export function extractDomain(input: string): string {
  if (!input) return ''
  try {
    const url = input.startsWith('http') ? new URL(input) : new URL(`https://${input}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    const atIndex = input.indexOf('@')
    if (atIndex > 0) return input.slice(atIndex + 1)
    return input
  }
}
