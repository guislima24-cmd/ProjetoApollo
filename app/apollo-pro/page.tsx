'use client'

import { useState } from 'react'

const data = {
  title: 'Apollo Pro',
  subtitle: 'Automated Prospecting Pipeline',
  vision:
    'Transformar prospecção manual em um pipeline inteligente, automatizado e colaborativo para toda a equipe comercial da UFABC Júnior.',
  phases: [
    {
      id: '01',
      name: 'Captura',
      color: '#00D4FF',
      icon: '⬇',
      description:
        'Leads entram no sistema automaticamente via LinkedIn (Phantombuster) e Gmail (Make). Zero digitação manual.',
      steps: [
        'Phantombuster monitora perfis salvos no LinkedIn',
        "Make captura e-mails enviados com label 'Prospecção'",
        'Webhook dispara e cria registro na planilha central',
        'Dados: nome, cargo, empresa, e-mail, URL, data',
      ],
    },
    {
      id: '02',
      name: 'Enriquecimento',
      color: '#7B61FF',
      icon: '⚡',
      description:
        'Apollo (ProspectAI) puxa o lead da planilha e gera mensagem personalizada via IA com contexto da empresa-alvo.',
      steps: [
        'Apollo lê lead novo via Google Sheets API',
        'Claude gera mensagem personalizada por setor/porte',
        "Mensagem salva na planilha, status → 'Pronto p/ envio'",
        'Revisão opcional antes do disparo',
      ],
    },
    {
      id: '03',
      name: 'Envio',
      color: '#FF6B35',
      icon: '↗',
      description:
        'Make pega a mensagem aprovada e envia pelo Gmail da JR. Rastreamento de abertura e resposta automático.',
      steps: [
        "Make polling na planilha detecta status 'Pronto p/ envio'",
        'Gmail API envia com assinatura padrão da JR',
        "Status atualiza → 'Enviado' + timestamp",
        'Thread de resposta monitorado automaticamente',
      ],
    },
    {
      id: '04',
      name: 'Rastreamento',
      color: '#00FF88',
      icon: '◎',
      description:
        'Pipeline de status em tempo real. Toda a equipe comercial vê o mesmo painel atualizado sem esforço manual.',
      steps: [
        "Resposta detectada → status 'Respondeu'",
        'Sem resposta em 7 dias → alerta de follow-up',
        'Dashboard com taxa de resposta por membro',
        'Exportação para relatório de prospecção',
      ],
    },
  ],
  stack: [
    { name: 'Phantombuster', role: 'Captura LinkedIn', category: 'capture' },
    { name: 'Make', role: 'Automação de fluxos', category: 'automation' },
    { name: 'Google Sheets', role: 'Banco de dados central', category: 'data' },
    { name: 'Apollo / ProspectAI', role: 'Geração de mensagens IA', category: 'ai' },
    { name: 'Gmail API', role: 'Envio e rastreamento', category: 'email' },
    { name: 'Vercel', role: 'Deploy do Apollo', category: 'infra' },
  ],
  mvpScope: [
    { task: 'Estrutura da planilha Google Sheets', effort: '1h', priority: 'P0' },
    { task: 'Automação Make: Gmail → Sheets', effort: '2h', priority: 'P0' },
    { task: 'Integração Apollo ↔ Sheets API', effort: '4h', priority: 'P0' },
    { task: 'Webhook Make: Sheets → Gmail envio', effort: '2h', priority: 'P1' },
    { task: 'Phantombuster setup LinkedIn', effort: '1h', priority: 'P1' },
    { task: 'Dashboard de status (Apollo UI)', effort: '3h', priority: 'P2' },
  ],
  claudeCodePrompt: `Você está ajudando a construir o Apollo Pro — uma extensão do ProspectAI (Next.js/React) que integra com Google Sheets, Gmail via Make webhooks, e Phantombuster para automatizar o pipeline completo de prospecção comercial da UFABC Júnior.

CONTEXTO DO PROJETO:

- Repositório existente: Next.js + React + Tailwind
- Deploy: Vercel
- Objetivo: transformar o Apollo de gerador de mensagens em um pipeline completo de prospecção

ARQUITETURA TARGET:

1. Google Sheets como banco de dados central (colunas: id, nome, cargo, empresa, email, linkedin_url, fonte, mensagem_gerada, status, data_envio, data_resposta, responsavel)
1. Make webhooks que recebem leads e atualizam status
1. Apollo lê leads da Sheets via Google Sheets API, gera mensagem com Claude, salva de volta
1. Webhook de saída dispara Make para envio via Gmail

PRIMEIRO PASSO - implemente:

1. Conexão com Google Sheets API (service account) para ler e escrever leads
1. Endpoint POST /api/leads que recebe payload do Make e cria linha na planilha
1. Endpoint POST /api/leads/[id]/generate que chama Claude para gerar mensagem personalizada e salva na planilha
1. Endpoint PUT /api/leads/[id]/status para Make atualizar status após envio/resposta

Use variáveis de ambiente para credenciais. Retorne tipos TypeScript para todos os endpoints. Mostre também a estrutura de colunas da planilha que devo criar no Google Sheets.`,
}

const categoryColors: Record<string, string> = {
  capture: '#00D4FF',
  automation: '#7B61FF',
  data: '#00FF88',
  ai: '#FF6B35',
  email: '#FFD700',
  infra: '#FF6B9D',
}

const priorityColors: Record<string, string> = {
  P0: '#FF6B35',
  P1: '#7B61FF',
  P2: '#555',
}

export default function ApolloPitchDeck() {
  const [activePhase, setActivePhase] = useState(0)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(data.claudeCodePrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        background: '#080A0F',
        minHeight: '100vh',
        color: '#E8EAF0',
        fontFamily: "var(--font-ibm-plex-mono), 'IBM Plex Mono', 'Courier New', monospace",
        padding: '0',
        overflowX: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: '1px solid #1A1D26',
          padding: '32px 40px 24px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, #0D1117 0%, #080A0F 100%)',
        }}
      >
        <div>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#00D4FF',
                boxShadow: '0 0 12px #00D4FF',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                color: '#555',
                letterSpacing: '3px',
                textTransform: 'uppercase',
              }}
            >
              UFABC Júnior · Comercial
            </span>
          </div>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: '700',
              margin: 0,
              letterSpacing: '-1px',
              color: '#fff',
            }}
          >
            {data.title} <span style={{ color: '#00D4FF' }}>_</span>
          </h1>
          <p
            style={{
              color: '#7B61FF',
              margin: '4px 0 0',
              fontSize: '13px',
              letterSpacing: '1px',
            }}
          >
            {data.subtitle}
          </p>
        </div>
        <div
          style={{
            background: '#0D1117',
            border: '1px solid #1A1D26',
            borderRadius: '8px',
            padding: '12px 20px',
            fontSize: '11px',
            color: '#555',
            textAlign: 'right',
          }}
        >
          <div style={{ color: '#00FF88', marginBottom: '2px' }}>● ARCHITECTURE DOC</div>
          <div>v1.0 · 2026</div>
        </div>
      </div>

      <div style={{ padding: '40px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Vision */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0D1117 0%, #0F1420 100%)',
            border: '1px solid #1A1D26',
            borderLeft: '3px solid #7B61FF',
            borderRadius: '8px',
            padding: '24px 28px',
            marginBottom: '48px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              color: '#7B61FF',
              letterSpacing: '3px',
              marginBottom: '10px',
            }}
          >
            VISÃO DO PRODUTO
          </div>
          <p style={{ margin: 0, fontSize: '15px', lineHeight: '1.7', color: '#C0C5D0' }}>
            {data.vision}
          </p>
        </div>

        {/* Pipeline Phases */}
        <div style={{ marginBottom: '48px' }}>
          <div
            style={{
              fontSize: '10px',
              color: '#555',
              letterSpacing: '3px',
              marginBottom: '24px',
            }}
          >
            PIPELINE · 4 FASES
          </div>

          {/* Phase tabs */}
          <div
            style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}
          >
            {data.phases.map((phase, i) => (
              <button
                key={i}
                onClick={() => setActivePhase(i)}
                style={{
                  background: activePhase === i ? phase.color : 'transparent',
                  border: `1px solid ${activePhase === i ? phase.color : '#1A1D26'}`,
                  color: activePhase === i ? '#000' : '#555',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontFamily: 'inherit',
                  fontWeight: activePhase === i ? '700' : '400',
                  letterSpacing: '1px',
                  transition: 'all 0.15s',
                }}
              >
                {phase.id} · {phase.name.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Active phase detail */}
          {(() => {
            const phase = data.phases[activePhase]
            return (
              <div
                style={{
                  background: '#0D1117',
                  border: `1px solid ${phase.color}22`,
                  borderTop: `2px solid ${phase.color}`,
                  borderRadius: '8px',
                  padding: '28px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '28px',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <span style={{ fontSize: '28px' }}>{phase.icon}</span>
                    <div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: phase.color,
                          letterSpacing: '2px',
                        }}
                      >
                        FASE {phase.id}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>
                        {phase.name}
                      </div>
                    </div>
                  </div>
                  <p
                    style={{
                      color: '#8890A0',
                      lineHeight: '1.7',
                      fontSize: '13px',
                      margin: 0,
                    }}
                  >
                    {phase.description}
                  </p>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#555',
                      letterSpacing: '2px',
                      marginBottom: '14px',
                    }}
                  >
                    IMPLEMENTAÇÃO
                  </div>
                  {phase.steps.map((step, j) => (
                    <div
                      key={j}
                      style={{
                        display: 'flex',
                        gap: '10px',
                        marginBottom: '10px',
                        alignItems: 'flex-start',
                      }}
                    >
                      <span
                        style={{
                          color: phase.color,
                          fontSize: '10px',
                          marginTop: '3px',
                          flexShrink: 0,
                        }}
                      >
                        ▸
                      </span>
                      <span style={{ fontSize: '12px', color: '#8890A0', lineHeight: '1.5' }}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Stack + MVP side by side */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px',
            marginBottom: '48px',
          }}
        >
          {/* Tech Stack */}
          <div>
            <div
              style={{
                fontSize: '10px',
                color: '#555',
                letterSpacing: '3px',
                marginBottom: '20px',
              }}
            >
              TECH STACK
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.stack.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: '#0D1117',
                    border: '1px solid #1A1D26',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: categoryColors[item.category],
                        boxShadow: `0 0 8px ${categoryColors[item.category]}`,
                      }}
                    />
                    <span
                      style={{ fontSize: '13px', color: '#E8EAF0', fontWeight: '600' }}
                    >
                      {item.name}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#555' }}>{item.role}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MVP Scope */}
          <div>
            <div
              style={{
                fontSize: '10px',
                color: '#555',
                letterSpacing: '3px',
                marginBottom: '20px',
              }}
            >
              MVP SCOPE · ESFORÇO ESTIMADO
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.mvpScope.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: '#0D1117',
                    border: '1px solid #1A1D26',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}
                  >
                    <span
                      style={{
                        fontSize: '9px',
                        color: priorityColors[item.priority],
                        border: `1px solid ${priorityColors[item.priority]}`,
                        padding: '2px 6px',
                        borderRadius: '3px',
                        flexShrink: 0,
                      }}
                    >
                      {item.priority}
                    </span>
                    <span style={{ fontSize: '12px', color: '#8890A0' }}>{item.task}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#00FF88', flexShrink: 0 }}>
                    {item.effort}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: '12px',
                padding: '10px 16px',
                background: '#0A0F1A',
                border: '1px solid #1A1D26',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '11px', color: '#555' }}>TOTAL ESTIMADO</span>
              <span style={{ fontSize: '13px', color: '#00FF88', fontWeight: '700' }}>
                ~13h
              </span>
            </div>
          </div>
        </div>

        {/* Claude Code Prompt */}
        <div>
          <div
            style={{
              fontSize: '10px',
              color: '#555',
              letterSpacing: '3px',
              marginBottom: '20px',
            }}
          >
            PROMPT PARA O CLAUDE CODE
          </div>
          <div
            style={{
              background: '#0D1117',
              border: '1px solid #1A1D26',
              borderTop: '2px solid #00D4FF',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 20px',
                borderBottom: '1px solid #1A1D26',
                background: '#0A0E16',
              }}
            >
              <div style={{ display: 'flex', gap: '6px' }}>
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#FF5F57',
                  }}
                />
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#FEBC2E',
                  }}
                />
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#28C840',
                  }}
                />
              </div>
              <span
                style={{ fontSize: '10px', color: '#555', letterSpacing: '2px' }}
              >
                claude-code-prompt.txt
              </span>
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? '#00FF8822' : 'transparent',
                  border: `1px solid ${copied ? '#00FF88' : '#1A1D26'}`,
                  color: copied ? '#00FF88' : '#555',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontFamily: 'inherit',
                  letterSpacing: '1px',
                  transition: 'all 0.2s',
                }}
              >
                {copied ? '✓ COPIADO' : 'COPIAR'}
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                padding: '24px',
                fontSize: '11px',
                lineHeight: '1.8',
                color: '#8890A0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '320px',
                overflowY: 'auto',
              }}
            >
              {data.claudeCodePrompt}
            </pre>
          </div>
          <div
            style={{
              marginTop: '12px',
              fontSize: '11px',
              color: '#555',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ color: '#00D4FF' }}>→</span>
            Cole esse prompt direto no Claude Code dentro do repositório do Apollo para iniciar
            a implementação.
          </div>
        </div>
      </div>
    </div>
  )
}
