export type TemplateKey =
  | 'pitch_curto'
  | 'pitch_longo'
  | 'followup_1'
  | 'followup_2'
  | 'followup_3'
  | 'followup_4'
  | 'followup_5'

export const MESSAGE_TEMPLATES: Record<TemplateKey, string> = {
  pitch_curto: `{saudacao}, {lead}! Vi que você está na {empresa} e seu perfil chamou minha atenção. Sou {membro}, da UFABC Jr., consultoria vinculada à Universidade Federal do ABC.

Criamos projetos sob medida em otimização de processos, dados e estratégia, com foco real em redução de custos e aumento de eficiência. Já atendemos empresas como Dengo, Samsung e BASF, abrangendo diversos portes e segmentos.

Seu perfil tem um encaixe claro com os negócios que alavancarmos com nossos projetos. Topa um bate-papo rápido na próxima semana? Posso entender seus desafios e mostrar como geramos valor na prática. Que tal terça ou quarta?`,

  pitch_longo: `{saudacao}, {lead}. Tudo bem?

Gostei do seu perfil e vi que compõe o time da {empresa}. Meu nome é {membro} e sou da equipe da UFABC Jr., empresa vinculada à Universidade Federal do ABC.

Desenvolvemos projetos personalizados para otimizar processos, eliminar gargalos e tomar decisões com base em dados. Nosso foco está em resultados práticos como redução de custos, aumento de eficiência, melhoria na organização e mais estratégia para o crescimento dos seus negócios.

Nós já trabalhamos com empresas no mercado nacional e internacional, como a Dengo, a Samsung e a BASF. Com este repertório, demonstramos que podemos impulsionar desde as pequenas até as grandes empresas.

Decidi te mandar essa mensagem porque vi um forte fit com o perfil de empresas que ajudamos a alavancar. Você tem um horário na semana que vem para um bate-papo rápido? Quero entender melhor o contexto da sua empresa e ver como podemos gerar valor com soluções sob medida.`,

  followup_1: `Opa, {lead}! Tudo bem?

Gostaria de apresentar um de nossos clientes satisfeitos.

A DASA é uma rede de medicina diagnóstica com diversas empresas reconhecidas no mercado brasileiro, como a Lavoisier e a Delboni.

Quando entramos em contato com eles, enfrentavam um gargalo crítico: excesso de retrabalho e desorganização operacional, o que afetava diretamente a eficiência e a experiência dos pacientes, mesmo em uma empresa desse porte.

Nosso projeto padronizou e otimizou a gestão de 17 unidades. O impacto foi direto: o tempo de atendimento caiu horas, permitindo que mais pessoas fossem atendidas com qualidade e agilidade, configurando um ganho real de capacidade e eficiência.

Se esse tipo de resultado prático faz sentido para a {empresa}, podemos marcar uma conversa de 30 minutos nos próximos dias? Tenho algumas vagas disponíveis essa semana, posso te enviar os horários.`,

  followup_2: ``, // VAZIO — será preenchido depois pela equipe

  followup_3: `Vamos direto ao ponto, {lead}. A rotina corrida acaba muitas vezes dificultando a comunicação.

É justamente por isso que estou enviando uma apresentação nossa para você, caso queira dar uma olhada rápida e conhecer melhor a gente antes de batermos um papo.

Link: {link_apresentacao}

Se fizer sentido para você, podemos conversar nos próximos dias.

Caso prefira outro meio de contato, deixo meu telefone: {telefone}.`,

  followup_4: `{saudacao}, {lead}.

Teve a oportunidade de ver nosso material? Se não, fico disponível para explicar quaisquer dúvidas sobre ele.

Permaneço à disposição!`,

  followup_5: `Tudo bem, {lead}?

Devemos parar por aqui?

Em nossas últimas mensagens, mostramos a você um pouco sobre nossa cultura e nosso modo de operar. Estendemos uma grande oportunidade para que você pudesse entender um pouco melhor sobre o que faz a UFABC Jr. única.

Agora, tenho uma pergunta a você: Deixar a oportunidade passar vale a pena?

Se for o caso, este é o ponto em que nos despedimos. Mas se em algum momento você reconsiderar, estamos sempre de portas abertas e permanecemos à disposição.`,
}

// Preencher com o link real da apresentação institucional da UFABC Jr.
export const LINK_APRESENTACAO_INSTITUCIONAL = ''

// Dias de espera após o evento anterior para enviar cada template
export const CADENCIA_DIAS: Record<TemplateKey, number> = {
  pitch_curto: 0,
  pitch_longo:  0,
  followup_1:   3,
  followup_2:   5,
  followup_3:   7,
  followup_4:   7,
  followup_5:  10,
}

// Após followup_5 enviado, se não responder em 14 dias → descartado automaticamente
export const DIAS_ATE_DESCARTE_APOS_FU5 = 14
