import { NextResponse } from 'next/server'
import { listActualMemberTabs, normalizePrivateKey } from '@/lib/sheets'
import { MEMBER_TABS } from '@/lib/members'

/**
 * GET /api/member-leads/debug
 *
 * Diagnóstico das envs do Google Sheets sem vazar a chave privada.
 * Mostra se a chave chegou ao runtime com formato de PEM válida.
 */
export async function GET() {
  const rawJson = process.env.GOOGLE_CREDENTIALS_JSON
  const rawEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_PRIVATE_KEY

  const result: Record<string, unknown> = {
    has_GOOGLE_CREDENTIALS_JSON: Boolean(rawJson),
    has_GOOGLE_SERVICE_ACCOUNT_EMAIL: Boolean(rawEmail),
    has_GOOGLE_PRIVATE_KEY: Boolean(rawKey),
    has_GOOGLE_SHEETS_ID: Boolean(process.env.GOOGLE_SHEETS_ID),
    has_GOOGLE_MEMBER_SHEETS_ID: Boolean(process.env.GOOGLE_MEMBER_SHEETS_ID),
    has_ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
  }

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson.trim())
      result.credentials_json = {
        parses_as_json: true,
        has_client_email: Boolean(parsed.client_email),
        has_private_key: Boolean(parsed.private_key),
        private_key_starts_with: typeof parsed.private_key === 'string'
          ? parsed.private_key.slice(0, 30)
          : null,
        private_key_ends_with: typeof parsed.private_key === 'string'
          ? parsed.private_key.slice(-30)
          : null,
        private_key_length: typeof parsed.private_key === 'string'
          ? parsed.private_key.length
          : 0,
      }
    } catch (e) {
      result.credentials_json = {
        parses_as_json: false,
        error: (e as Error).message,
      }
    }
  }

  if (rawKey) {
    const normalized = normalizePrivateKey(rawKey) ?? ''
    result.private_key_inspection = {
      raw_length: rawKey.length,
      raw_first_30: rawKey.slice(0, 30),
      raw_last_30: rawKey.slice(-30),
      raw_contains_literal_backslash_n: rawKey.includes('\\n'),
      raw_contains_real_newline: rawKey.includes('\n'),
      raw_starts_with_quote: rawKey.startsWith('"') || rawKey.startsWith("'"),
      normalized_length: normalized.length,
      normalized_first_30: normalized.slice(0, 30),
      normalized_last_30: normalized.slice(-30),
      normalized_has_begin_marker: normalized.includes('-----BEGIN PRIVATE KEY-----'),
      normalized_has_end_marker: normalized.includes('-----END PRIVATE KEY-----'),
      normalized_line_count: normalized.split('\n').length,
    }
  }

  // Comparação abas configuradas (código) × abas reais (planilha).
  // É o atalho pra diagnosticar "não escreveu na aba certa" / "planilha não preencheu".
  try {
    const actual = await listActualMemberTabs()
    const configured = [...MEMBER_TABS]
    const missingInSheet = configured.filter((t) => !actual.includes(t))
    const extraInSheet = actual.filter((t) => !configured.includes(t as (typeof MEMBER_TABS)[number]))
    result.member_tabs = {
      configured,
      actual,
      missing_in_sheet: missingInSheet, // definidas em members.ts mas NÃO existem na planilha → causam 400 no append
      extra_in_sheet: extraInSheet,     // existem na planilha mas não mapeadas no código
      in_sync: missingInSheet.length === 0,
    }
  } catch (e) {
    result.member_tabs = { error: (e as Error).message }
  }

  return NextResponse.json(result)
}
