import { MESSAGE_TEMPLATES, LINK_APRESENTACAO_INSTITUCIONAL, type TemplateKey } from './messages'
import { MEMBER_PROFILES } from '@/lib/members.config'

export function getSaudacao(date: Date = new Date()): string {
  const hora = date.getHours()
  if (hora >= 5 && hora < 12) return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export interface RenderVars {
  lead:         string  // nome completo do decisor
  empresa:      string  // nome da empresa
  membro_email: string  // email canônico do membro que envia
}

export interface RenderResult {
  sucesso:  boolean
  mensagem: string
  erro?:    string
}

export function renderTemplate(
  templateKey: TemplateKey,
  vars: RenderVars,
  data: Date = new Date(),
): RenderResult {
  const template = MESSAGE_TEMPLATES[templateKey]

  if (!template || template.trim() === '') {
    return {
      sucesso:  false,
      mensagem: '',
      erro:     `Template "${templateKey}" ainda não foi preenchido pela equipe.`,
    }
  }

  const profile = MEMBER_PROFILES[vars.membro_email.toLowerCase().trim()]
  if (!profile?.nome || !profile?.telefone) {
    return {
      sucesso:  false,
      mensagem: '',
      erro:     'Cadastre seu nome e telefone no perfil antes de prospectar.',
    }
  }

  // followup_3 exige link da apresentação
  if (templateKey === 'followup_3' && !LINK_APRESENTACAO_INSTITUCIONAL) {
    return {
      sucesso:  false,
      mensagem: '',
      erro:     'Link da apresentação institucional não configurado. Peça para o admin preencher em /admin/configuracoes.',
    }
  }

  const mensagem = template
    .replaceAll('{saudacao}',          getSaudacao(data))
    .replaceAll('{lead}',              vars.lead.split(' ')[0])
    .replaceAll('{empresa}',           vars.empresa)
    .replaceAll('{membro}',            profile.nome)
    .replaceAll('{telefone}',          profile.telefone)
    .replaceAll('{link_apresentacao}', LINK_APRESENTACAO_INSTITUCIONAL)

  return { sucesso: true, mensagem }
}
