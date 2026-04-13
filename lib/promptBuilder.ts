import { CampaignConfig, Lead, ManualLead, PipelineLead } from '@/types'

export function buildSystemPrompt(config: CampaignConfig): string {
  const metodologiaInstrucoes =
    config.metodologia === 'CLASSICA'
      ? `Se metodologia for CLÁSSICA, estruture assim:
1. PROBLEMA: gere empatia mostrando que entende o contexto/dor do lead
2. SOLUÇÃO: apresente a UFABC Júnior como caminho lógico
3. BENEFÍCIOS: foque em resultados tangíveis, não no que fazemos mas no que entregamos
4. DIFERENCIAL: responda implicitamente "por que UFABC Júnior e não outro?"
5. CTA: convide para uma reunião diagnóstica de forma específica e com urgência`
      : `Se metodologia for AIDA, estruture assim:
1. ATENÇÃO: capture com uma dor ou pergunta provocadora sobre o setor/empresa do lead
2. INTERESSE: gere curiosidade apresentando a UFABC Júnior como solução
3. DESEJO: mostre valor e exclusividade para criar vontade de conversar
4. AÇÃO: CTA direto convidando para reunião diagnóstica`

  return `Você é um especialista em prospecção B2B para empresas juniores universitárias.
Sua função é escrever mensagens de prospecção personalizadas, diretas e humanas
para o time comercial da UFABC Júnior.

Regras obrigatórias:
- NUNCA mencione serviços específicos (Mapeamento de Processos, Pesquisa de Mercado, etc.)
- O único objetivo da mensagem é conseguir uma reunião diagnóstica
- NUNCA use frases genéricas como "Espero que esteja bem" ou "Me chamo X e trabalho em Y"
- SEMPRE comece com algo específico sobre a empresa ou o setor do lead
- A mensagem deve parecer escrita por um humano que pesquisou o lead
- Máximo de ${config.limite_caracteres} caracteres
- Tom: ${config.tom}
- Canal: ${config.canal}
- Metodologia: ${config.metodologia}

${metodologiaInstrucoes}

Formato de resposta: apenas o texto da mensagem, sem aspas, sem explicações adicionais.`
}

export function buildLeadPrompt(lead: Lead): string {
  return `Escreva uma mensagem de prospecção para o seguinte lead:

- Nome: ${lead.nome} ${lead.sobrenome || ''}
- Cargo: ${lead.cargo || 'Não informado'}
- Empresa: ${lead.empresa}
- Setor: ${lead.setor || 'Não informado'}
- Tamanho da empresa: ${lead.tamanho || 'Não informado'} funcionários
- Localização: ${lead.cidade || 'Não informada'}
${lead.info_extra ? `\nContexto adicional: ${lead.info_extra}` : ''}

Lembre-se: a mensagem deve parecer personalizada para essa pessoa especificamente, não um template genérico.`
}

export function buildManualLeadPrompt(lead: ManualLead, config: CampaignConfig): string {
  return `Escreva uma mensagem de prospecção para o seguinte lead${config.canal === 'LinkedIn' ? ' do LinkedIn' : ''}.
Você tem informações ricas sobre o perfil dessa pessoa — use-as para
criar uma mensagem que pareça escrita por alguém que realmente pesquisou
o lead, não um template genérico.

- Nome: ${lead.nome}
- Cargo: ${lead.cargo}
- Empresa: ${lead.empresa}
- Setor: ${lead.setor}
- Tamanho empresa: ${lead.tamanho || 'Não informado'} funcionários
- Cidade: ${lead.cidade || 'Não informada'}
${lead.contexto_extra ? `\nInformações adicionais ${config.canal === 'LinkedIn' ? 'do perfil LinkedIn' : 'do lead'}:\n${lead.contexto_extra}` : ''}

Instruções:
- Comece referenciando algo específico do perfil (conquista, projeto, post, cargo atual, etc.)
- NÃO mencione serviços específicos — objetivo é a reunião diagnóstica
- Máximo de ${config.limite_caracteres} caracteres
- Tom: ${config.tom}
- Metodologia: ${config.metodologia}

Esta é uma mensagem de alto valor — o lead foi escolhido estrategicamente. A mensagem deve refletir isso.`
}

/** Prompt para geração automática no pipeline (via Google Sheets) */
export function buildPipelineSystemPrompt(): string {
  return `Você é um especialista em prospecção B2B para empresas juniores universitárias.
Sua função é escrever mensagens de prospecção personalizadas, diretas e humanas
para o time comercial da UFABC Júnior.

Regras obrigatórias:
- NUNCA mencione serviços específicos (Mapeamento de Processos, Pesquisa de Mercado, etc.)
- O único objetivo da mensagem é conseguir uma reunião diagnóstica
- NUNCA use frases genéricas como "Espero que esteja bem" ou "Me chamo X e trabalho em Y"
- SEMPRE comece com algo específico sobre a empresa ou o setor do lead
- A mensagem deve parecer escrita por um humano que pesquisou o lead
- Máximo de 600 caracteres
- Tom: Semiformal
- Metodologia AIDA:
  1. ATENÇÃO: capture com uma dor ou pergunta provocadora sobre o setor/empresa do lead
  2. INTERESSE: gere curiosidade apresentando a UFABC Júnior como solução
  3. DESEJO: mostre valor e exclusividade para criar vontade de conversar
  4. AÇÃO: CTA direto convidando para reunião diagnóstica

Formato de resposta: apenas o texto da mensagem, sem aspas, sem explicações adicionais.`
}

export function buildPipelineLeadPrompt(lead: PipelineLead): string {
  const canal = lead.linkedin_url ? 'LinkedIn' : 'Email'
  return `Escreva uma mensagem de prospecção ${canal === 'LinkedIn' ? 'para LinkedIn' : 'por e-mail'} para o seguinte lead:

- Nome: ${lead.nome}
- Cargo: ${lead.cargo || 'Não informado'}
- Empresa: ${lead.empresa}
- Fonte: ${lead.fonte || 'Não informada'}
${lead.linkedin_url ? `- LinkedIn: ${lead.linkedin_url}` : ''}

Lembre-se: a mensagem deve parecer personalizada para essa pessoa especificamente, não um template genérico.`
}

export function buildRegeneratePrompt(lead: Lead, mensagemAnterior: string): string {
  return `Reescreva a mensagem abaixo de forma diferente para o mesmo lead.
Use uma abordagem ou ângulo completamente diferente da versão anterior.

Lead: ${lead.nome} ${lead.sobrenome || ''} | ${lead.cargo || ''} | ${lead.empresa} | ${lead.setor || ''}

Versão anterior (NÃO repita esta abordagem):
${mensagemAnterior}

Escreva apenas a nova mensagem, sem explicações.`
}
