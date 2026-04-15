/**
 * Lista dos membros do time comercial e mapping de username → nome da aba.
 *
 * Separado de `lib/sheets.ts` porque o middleware do Next.js roda em Edge
 * runtime e não pode importar `googleapis` (Node-only).
 */

export const MEMBER_TABS = [
  'Anna', 'Daniel', 'Duda', 'Felipe',
  'Gui Lima', 'Gui Midolli', 'Gustavo',
  'Larissa', 'Léo', 'Leticia', 'Tiago',
] as const

export type MemberTab = typeof MEMBER_TABS[number]

/** username (slug sem acento/espaço) → nome exato da aba na planilha */
const USERNAME_TO_TAB: Record<string, MemberTab> = {
  'anna': 'Anna',
  'daniel': 'Daniel',
  'duda': 'Duda',
  'felipe': 'Felipe',
  'gui-lima': 'Gui Lima',
  'gui-midolli': 'Gui Midolli',
  'gustavo': 'Gustavo',
  'larissa': 'Larissa',
  'leo': 'Léo',
  'leticia': 'Leticia',
  'tiago': 'Tiago',
}

export function usernameToTab(username: string): MemberTab | null {
  return USERNAME_TO_TAB[username.trim().toLowerCase()] ?? null
}

export function isValidMemberTab(value: string): value is MemberTab {
  return (MEMBER_TABS as readonly string[]).includes(value)
}
