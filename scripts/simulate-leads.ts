import { renderTemplate } from '../lib/templates/render'
import { getPitchTemplate, classificarCargo } from '../lib/templates/cargo-classifier'
import type { TemplateKey } from '../lib/templates/messages'

const leads = [
  {
    nome:         'Ricardo Rossi Cabral',
    empresa:      'Hitocom',
    cargo:        'Diretor de Operações',
    membro_email: 'guilherme.lima@ufabcjr.com.br',
    hora:         14,
  },
  {
    nome:         'Patrícia Oliveira',
    empresa:      'Quality Fix do Brasil',
    cargo:        'Coordenadora de Processos',
    membro_email: 'guilherme.lima@ufabcjr.com.br',
    hora:         9,
  },
]

for (const lead of leads) {
  const vars = { lead: lead.nome, empresa: lead.empresa, membro_email: lead.membro_email }
  const data = new Date()
  data.setHours(lead.hora, 0, 0, 0)

  const classificacao = classificarCargo(lead.cargo)
  const pitchKey      = getPitchTemplate(lead.cargo)

  console.log('='.repeat(60))
  console.log(`LEAD    : ${lead.nome}`)
  console.log(`EMPRESA : ${lead.empresa}`)
  console.log(`CARGO   : ${lead.cargo}`)
  console.log(`CLASSI  : ${classificacao.toUpperCase()} → ${pitchKey}`)
  console.log('='.repeat(60))

  const templates: TemplateKey[] = [pitchKey, 'followup_1', 'followup_3']
  for (const key of templates) {
    const r = renderTemplate(key, vars, data)
    console.log(`\n--- ${key} ---`)
    if (r.sucesso) {
      console.log(r.mensagem)
    } else {
      console.log(`⛔ BLOQUEADO: ${r.erro}`)
    }
  }
  console.log()
}
