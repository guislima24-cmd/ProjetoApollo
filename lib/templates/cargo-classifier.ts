// Códigos C-level que precisam ser tokens exatos (evita "coo" dentro de "coordenador")
const CODIGOS_EXATOS = new Set([
  'ceo', 'cfo', 'cto', 'coo', 'cmo', 'cro', 'chro', 'cio', 'cso', 'vp',
])

// Termos mais longos que podem ser substrings do cargo
const TERMOS_SUBSTRING = [
  'chief',
  'diretor', 'director', 'diretora',
  'vice presidente', 'vice-presidente', 'vice president',
  'sócio', 'socio',
  'founder', 'co-founder', 'cofounder',
  'owner', 'proprietário', 'fundador', 'fundadora',
  'head of', 'head ',
  'presidente', 'president',
]

export function classificarCargo(cargo: string | null | undefined): 'curto' | 'longo' {
  if (!cargo) return 'longo'
  const lower = cargo.toLowerCase().trim()

  // Tokens separados por espaço, vírgula, ponto, hífen, barra, parênteses
  const tokens = lower.split(/[\s,.()\-\/&]+/).filter(Boolean)
  for (const token of tokens) {
    if (CODIGOS_EXATOS.has(token)) return 'curto'
  }

  for (const termo of TERMOS_SUBSTRING) {
    if (lower.includes(termo)) return 'curto'
  }

  return 'longo'
}

export function getPitchTemplate(cargo: string | null | undefined): 'pitch_curto' | 'pitch_longo' {
  return classificarCargo(cargo) === 'curto' ? 'pitch_curto' : 'pitch_longo'
}
