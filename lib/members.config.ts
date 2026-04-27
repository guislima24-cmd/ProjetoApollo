/**
 * Configuração de membros do comercial.
 *
 * Acesso: qualquer email @ufabcjr.com.br entra como 'member' automaticamente.
 * Roles especiais (manager) são definidos manualmente aqui.
 *
 * TAB_OVERRIDES: mapeia email → nome exato da aba na planilha real.
 * Adicionar uma entrada aqui quando o nome da aba não corresponder
 * ao nome completo da conta Google.
 */

export type MemberRole = 'manager' | 'pre-sales-leader' | 'member'

export const ALLOWED_DOMAIN = 'ufabcjr.com.br'

const ROLE_OVERRIDES: Record<string, MemberRole> = {
  'guilherme.lima@ufabcjr.com.br': 'manager',
  'guislima24@gmail.com':          'manager',
  'tiago.santos@ufabcjr.com.br':   'manager',
}

// Mapeamento email → nome exato da aba na planilha real do comercial.
// Necessário quando o nome da aba diverge do displayName da conta Google.
const TAB_OVERRIDES: Record<string, string> = {
  'guilherme.lima@ufabcjr.com.br':   'Gui Lima',
  'guislima24@gmail.com':            'Gui Lima',
  'felipe.ikeda@ufabcjr.com.br':     'Felipe',
  'leonardo.aguilar@ufabcjr.com.br': 'Léo',
  'maria.almeida@ufabcjr.com.br':    'Duda',
  'tiago.santos@ufabcjr.com.br':     'Tiago',
}

// Emails fora do domínio com acesso explícito (ex: devs, admin)
const ALLOWED_EMAILS = new Set(['guislima24@gmail.com'])

export function isAllowedEmail(email: string): boolean {
  const e = email.toLowerCase().trim()
  return e.endsWith(`@${ALLOWED_DOMAIN}`) || ALLOWED_EMAILS.has(e)
}

export function isAdmin(role: MemberRole): boolean {
  return role === 'manager' || role === 'pre-sales-leader'
}

export function getMemberRole(email: string): MemberRole {
  return ROLE_OVERRIDES[email.toLowerCase().trim()] ?? 'member'
}

/**
 * Retorna o nome da aba na planilha para um membro.
 * Prioridade: TAB_OVERRIDES[email] → fallback para displayName do Google.
 */
export function getTabName(email: string, fullName: string): string {
  const override = TAB_OVERRIDES[email.toLowerCase().trim()]
  if (override) return override
  return fullName.trim().slice(0, 100)
}

/** @deprecated use getTabName(email, fullName) */
export function nameToTab(fullName: string): string {
  return fullName.trim().slice(0, 100)
}

/**
 * Abas de membros na planilha real do comercial.
 * Adicione novas entradas quando um membro entrar no time.
 * Apenas essas abas são tratadas como dados de prospecção — as demais
 * (KPIs, RDs, Prospecções, etc.) são ignoradas pelo sistema.
 */
export const MEMBER_TABS = [
  'Gui Lima', 'Gui Midolli', 'Anna', 'Daniel', 'Duda', 'Felipe',
  'Gustavo', 'Larissa', 'Léo', 'Letícia', 'Tiago',
]

export function getAllMemberTabs(): string[] {
  return MEMBER_TABS
}

export function getMemberTab(_email: string): string | null {
  return null
}
