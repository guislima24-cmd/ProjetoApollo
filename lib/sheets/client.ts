import { google, sheets_v4 } from 'googleapis'

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

export function getCredentials(): { client_email: string; private_key: string } {
  const rawJson = process.env.GOOGLE_CREDENTIALS_JSON
  if (rawJson) {
    const parsed = JSON.parse(rawJson.trim()) as { client_email?: string; private_key?: string }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('GOOGLE_CREDENTIALS_JSON precisa ter client_email e private_key')
    }
    return { client_email: parsed.client_email, private_key: parsed.private_key }
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key   = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY ?? '')
  if (!email || !key) {
    throw new Error('Configure GOOGLE_CREDENTIALS_JSON ou GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY')
  }
  return { client_email: email, private_key: key }
}

export function getSheets(): sheets_v4.Sheets {
  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_ID
  if (!id) throw new Error('GOOGLE_SHEETS_ID não configurado.')
  return id
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseMs = 1000): Promise<T> {
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

export function sanitize(value: string): string {
  if (value && /^[=+\-@]/.test(value)) return `'${value}`
  return value
}
