/**
 * Teste isolado do template engine.
 * Rodar com: npx tsx scripts/test-templates.ts
 */

import { MESSAGE_TEMPLATES, CADENCIA_DIAS, LINK_APRESENTACAO_INSTITUCIONAL, type TemplateKey } from '../lib/templates/messages'
import { classificarCargo } from '../lib/templates/cargo-classifier'
import { MEMBER_PROFILES } from '../lib/members.config'

// ── helpers de output ────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function ok(label: string) {
  console.log(`  ✓ ${label}`)
  passed++
}

function fail(label: string, detail?: string) {
  console.error(`  ✗ ${label}${detail ? ` → ${detail}` : ''}`)
  failed++
}

function section(title: string) {
  console.log(`\n${title}`)
  console.log('─'.repeat(title.length))
}

// ── getSaudacao ──────────────────────────────────────────────────────────────

section('getSaudacao()')

function getSaudacao(hora: number): string {
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

const casos = [
  [0,  'Boa noite'],
  [4,  'Boa noite'],
  [5,  'Bom dia'],
  [11, 'Bom dia'],
  [12, 'Boa tarde'],
  [17, 'Boa tarde'],
  [18, 'Boa noite'],
  [23, 'Boa noite'],
] as const

for (const [hora, esperado] of casos) {
  const resultado = getSaudacao(hora)
  resultado === esperado
    ? ok(`hora=${hora} → "${resultado}"`)
    : fail(`hora=${hora}`, `esperado "${esperado}", got "${resultado}"`)
}

// ── classificarCargo ─────────────────────────────────────────────────────────

section('classificarCargo()')

const casosCargo: [string | null | undefined, 'curto' | 'longo'][] = [
  // C-level exatos
  ['CEO',                          'curto'],
  ['CFO',                          'curto'],
  ['COO',                          'curto'],
  ['CTO',                          'curto'],
  ['CIO',                          'curto'],
  ['VP Marketing',                 'curto'],
  ['VP, Sales',                    'curto'],
  // Termos substring
  ['Diretor Comercial',            'curto'],
  ['Diretora de Operações',        'curto'],
  ['Co-Founder & CTO',             'curto'],
  ['Head of Sales',                'curto'],
  ['Sócio-Diretor',                'curto'],
  ['Presidente',                   'curto'],
  ['Vice-Presidente',              'curto'],
  // Não deve fazer falso positivo
  ['Coordenador de TI',            'longo'],  // continha "coo" → BUG corrigido
  ['Analista de Marketing',        'longo'],
  ['Gerente de Projetos',          'longo'],
  ['Especialista',                 'longo'],
  ['Supervisor de Operações',      'longo'],
  // Nulos
  [null,                           'longo'],
  [undefined,                      'longo'],
  ['',                             'longo'],
]

for (const [cargo, esperado] of casosCargo) {
  const resultado = classificarCargo(cargo)
  resultado === esperado
    ? ok(`"${cargo ?? 'null/undefined'}" → ${resultado}`)
    : fail(`"${cargo}"`, `esperado ${esperado}, got ${resultado}`)
}

// ── MESSAGE_TEMPLATES ────────────────────────────────────────────────────────

section('MESSAGE_TEMPLATES — presença e variáveis')

const ALL_KEYS: TemplateKey[] = [
  'pitch_curto', 'pitch_longo',
  'followup_1', 'followup_2', 'followup_3', 'followup_4', 'followup_5',
]

const VARS_USADAS: Record<TemplateKey, string[]> = {
  pitch_curto:  ['{saudacao}', '{lead}', '{empresa}', '{membro}'],
  pitch_longo:  ['{saudacao}', '{lead}', '{empresa}', '{membro}'],
  followup_1:   ['{lead}', '{empresa}'],
  followup_2:   [],
  followup_3:   ['{lead}', '{telefone}', '{link_apresentacao}'],
  followup_4:   ['{saudacao}', '{lead}'],
  followup_5:   ['{lead}'],
}

for (const key of ALL_KEYS) {
  const tpl = MESSAGE_TEMPLATES[key]
  if (key === 'followup_2') {
    tpl === ''
      ? ok(`${key}: vazio (esperado)`)
      : fail(`${key}`, 'deveria estar vazio')
    continue
  }
  if (!tpl || tpl.trim() === '') {
    fail(`${key}`, 'template ausente ou vazio')
    continue
  }
  ok(`${key}: preenchido (${tpl.length} chars)`)
  for (const v of VARS_USADAS[key]) {
    tpl.includes(v)
      ? ok(`  ${key} contém ${v}`)
      : fail(`  ${key} contém ${v}`, 'VARIÁVEL AUSENTE')
  }
}

// ── renderTemplate — substituição ────────────────────────────────────────────

section('renderTemplate() — substituição de variáveis')

function renderTemplate(key: TemplateKey, vars: { lead: string; empresa: string; membro_email: string }, hora = 10) {
  const tpl = MESSAGE_TEMPLATES[key]
  if (!tpl || tpl.trim() === '') {
    return { sucesso: false, mensagem: '', erro: `Template ${key} ainda não foi preenchido pela equipe.` }
  }
  const profile = MEMBER_PROFILES[vars.membro_email]
  if (!profile || !profile.nome || !profile.telefone) {
    return { sucesso: false, mensagem: '', erro: 'Cadastre seu nome e telefone no perfil antes de prospectar.' }
  }
  const saudacao = getSaudacao(hora)
  let msg = tpl
    .replaceAll('{saudacao}', saudacao)
    .replaceAll('{lead}', vars.lead.split(' ')[0])
    .replaceAll('{empresa}', vars.empresa)
    .replaceAll('{membro}', profile.nome)
    .replaceAll('{telefone}', profile.telefone)
    .replaceAll('{link_apresentacao}', LINK_APRESENTACAO_INSTITUCIONAL)
  return { sucesso: true, mensagem: msg }
}

const varsOk = { lead: 'Ana Paula', empresa: 'Acme S.A.', membro_email: 'guilherme.lima@ufabcjr.com.br' }

// Templates que devem ter sucesso
for (const key of ALL_KEYS.filter(k => k !== 'followup_2')) {
  if (key === 'followup_3' && !LINK_APRESENTACAO_INSTITUCIONAL) {
    // link vazio é permitido estruturalmente (bloqueio será na camada de envio)
    const r = renderTemplate(key, varsOk)
    r.sucesso
      ? ok(`${key}: renderizou (link vazio — placeholder mantido)`)
      : fail(`${key}: erro inesperado — ${r.erro}`)
    continue
  }
  const r = renderTemplate(key, varsOk)
  if (!r.sucesso) { fail(`${key}`, r.erro); continue }
  // Nenhuma variável não substituída deve sobrar
  const restantes = r.mensagem.match(/\{[a-z_]+\}/g) ?? []
  restantes.length === 0
    ? ok(`${key}: sem variáveis não substituídas`)
    : fail(`${key}`, `variáveis restantes: ${restantes.join(', ')}`)
  // {lead} deve ser só o primeiro nome
  r.mensagem.includes('Ana')
    ? ok(`${key}: primeiro nome correto ("Ana")`)
    : fail(`${key}`, '{lead} não substituído corretamente')
}

// followup_2 deve bloquear
const r2 = renderTemplate('followup_2', varsOk)
!r2.sucesso
  ? ok('followup_2: bloqueado por template vazio ✓')
  : fail('followup_2', 'deveria bloquear mas não bloqueou')

// perfil incompleto deve bloquear
const varsSemPerfil = { lead: 'João', empresa: 'Beta', membro_email: 'anna.ferreira@ufabcjr.com.br' }
const rSemPerfil = renderTemplate('pitch_curto', varsSemPerfil)
!rSemPerfil.sucesso
  ? ok(`perfil incompleto: bloqueado com "${rSemPerfil.erro}"`)
  : fail('perfil incompleto', 'deveria bloquear')

// ── CADENCIA_DIAS ─────────────────────────────────────────────────────────────

section('CADENCIA_DIAS — todos os templates cobertos')

for (const key of ALL_KEYS) {
  typeof CADENCIA_DIAS[key] === 'number'
    ? ok(`${key}: ${CADENCIA_DIAS[key]} dias`)
    : fail(`${key}`, 'CADENCIA_DIAS ausente')
}

// ── Resultado final ───────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(40)}`)
console.log(`Total: ${passed + failed} testes | ✓ ${passed} passou | ✗ ${failed} falhou`)
if (failed > 0) process.exit(1)
