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

export type MemberRole =  'manager' | 'pre-sales-leader' | 'member'

export const ALLOWED_DOMAIN = 'ufabcjr.com.br'

const ROLE_OVERRIDES: Record<string, MemberRole> = {
  'guilherme.lima@ufabcjr.com.br': 'manager',
  'guislima24@gmail.com':          'manager',
  'tiago.santos@ufabcjr.com.br':   'manager',
}

// Mapeamento email → nome exato da aba na planilha real do comercial.
// Necessário quando o nome da aba diverge do displayName da conta Google.
const TAB_OVERRIDES: Record<string, string> = {
  'guilherme.lima@ufabcjr.com.br':    'Gui Lima',
  'guislima24@gmail.com':             'Gui Lima',
  'guilherme.midolli@ufabcjr.com.br': 'Gui Midolli',
  'larissa.preto@ufabcjr.com.br':     'Larissa',
  'gustavo.sumita@ufabcjr.com.br':    'Gustavo',
  'anna.ferreira@ufabcjr.com.br':     'Anna',
  'felipe.ikeda@ufabcjr.com.br':      'Felipe',
  'leonardo.aguilar@ufabcjr.com.br':  'Léo',
  'maria.almeida@ufabcjr.com.br':     'Duda',
  'tiago.santos@ufabcjr.com.br':      'Tiago',
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

// ── Distribuição LinkedIn ─────────────────────────────────────────────────────

/** Emails com acesso ao painel admin (gerente + líderes de vendas). */
export const ADMIN_EMAILS = new Set([
  'guilherme.lima@ufabcjr.com.br',
  'guislima24@gmail.com',
  'tiago.santos@ufabcjr.com.br',
  'felipe.ikeda@ufabcjr.com.br',
  'anna.ferreira@ufabcjr.com.br',
])

export interface MemberDistribution {
  email:                       string
  nome:                        string
  ativo:                       boolean
  capacidade_semanal_empresas: number
}

/** Membros ativos para distribuição de leads LinkedIn. */
export const MEMBERS_DISTRIBUTION: MemberDistribution[] = [
  { email: 'guilherme.lima@ufabcjr.com.br',    nome: 'Gui Lima',    ativo: true, capacidade_semanal_empresas: 17 },
  { email: 'guilherme.midolli@ufabcjr.com.br', nome: 'Gui Midolli', ativo: true, capacidade_semanal_empresas: 17 },
  { email: 'larissa.preto@ufabcjr.com.br',     nome: 'Larissa',     ativo: true, capacidade_semanal_empresas: 17 },
  { email: 'gustavo.sumita@ufabcjr.com.br',    nome: 'Gustavo',     ativo: true, capacidade_semanal_empresas: 17 },
  { email: 'anna.ferreira@ufabcjr.com.br',     nome: 'Anna',        ativo: true, capacidade_semanal_empresas: 17 },
  { email: 'felipe.ikeda@ufabcjr.com.br',      nome: 'Felipe',      ativo: true, capacidade_semanal_empresas: 17 },
  { email: 'leonardo.aguilar@ufabcjr.com.br',  nome: 'Léo',         ativo: true, capacidade_semanal_empresas: 17 },
  { email: 'maria.almeida@ufabcjr.com.br',     nome: 'Duda',        ativo: true, capacidade_semanal_empresas: 17 },
  { email: 'tiago.santos@ufabcjr.com.br',      nome: 'Tiago',       ativo: true, capacidade_semanal_empresas: 17 },
]

/** Retorna o nome da aba do membro pelo email (sem precisar do displayName). */
export function getTabByEmail(email: string): string | null {
  return TAB_OVERRIDES[email.toLowerCase().trim()] ?? null
}

/** Reverse lookup: retorna o email canônico dado o nome da aba (col R da Leads CSV). */
export function getEmailByTabName(tabName: string): string | null {
  return MEMBERS_DISTRIBUTION.find(m => m.nome === tabName)?.email ?? null
}

/**
 * Resolve o email canônico do membro em MEMBERS_DISTRIBUTION.
 * Necessário porque um membro pode ter emails alternativos (ex: Gmail pessoal + @ufabcjr).
 * Exemplo: guislima24@gmail.com → "Gui Lima" → guilherme.lima@ufabcjr.com.br
 */
export function getCanonicalMemberEmail(sessionEmail: string): string {
  const e       = sessionEmail.toLowerCase().trim()
  const tabName = TAB_OVERRIDES[e]
  if (!tabName) return e
  const member = MEMBERS_DISTRIBUTION.find(m => m.nome.toLowerCase() === tabName.toLowerCase())
  return member?.email ?? e
}

/** Verifica se o email tem acesso de admin ao painel /admin/*. */
export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.has(email.toLowerCase().trim())
}

// ── Perfis individuais dos membros ───────────────────────────────────────────
// Nome e telefone usados para personalizar os templates de mensagem.
// Admins editam via /admin/membros. Membros com campos vazios ficam bloqueados
// de enviar mensagens até que o admin preencha.

export interface MemberProfile {
  nome:     string
  telefone: string
}

export const MEMBER_PROFILES: Record<string, MemberProfile> = {
  'guilherme.lima@ufabcjr.com.br':    { nome: 'Guilherme Lima', telefone: '(11) 96347-2667' },
  'guilherme.midolli@ufabcjr.com.br': { nome: '', telefone: '' },
  'larissa.preto@ufabcjr.com.br':     { nome: '', telefone: '' },
  'gustavo.sumita@ufabcjr.com.br':    { nome: '', telefone: '' },
  'anna.ferreira@ufabcjr.com.br':     { nome: '', telefone: '' },
  'felipe.ikeda@ufabcjr.com.br':      { nome: '', telefone: '' },
  'leonardo.aguilar@ufabcjr.com.br':  { nome: '', telefone: '' },
  'maria.almeida@ufabcjr.com.br':     { nome: '', telefone: '' },
  'tiago.santos@ufabcjr.com.br':      { nome: '', telefone: '' },
}

export function getMemberProfile(email: string): MemberProfile | null {
  return MEMBER_PROFILES[email.toLowerCase().trim()] ?? null
}
