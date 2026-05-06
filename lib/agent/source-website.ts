export interface WebsiteData {
  emails:  string[]
  phones:  string[]
  summary: string | null
}

export function parseWebsiteData(rawText: string): WebsiteData {
  if (!rawText) return { emails: [], phones: [], summary: null }

  const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const emails = [...new Set(rawText.match(emailRe) ?? [])]
    .filter(e =>
      !e.endsWith('.png') && !e.endsWith('.jpg') &&
      !e.includes('sentry.') && !e.includes('example.') &&
      !e.startsWith('no-reply') && !e.startsWith('noreply')
    )
    .slice(0, 5)

  const phoneRe = /(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}/g
  const phones = [...new Set(rawText.match(phoneRe) ?? [])]
    .filter(p => p.replace(/\D/g, '').length >= 10)
    .slice(0, 3)

  // Find a paragraph-like sentence with company context
  const lines = rawText.split(/\n|\./).map(l => l.trim()).filter(l => l.length > 60 && l.length < 400)
  const summary = lines[0] ?? null

  return { emails, phones, summary }
}
