'use client'

import { useState } from 'react'
import { ConfiancaNivel, ExtractionResult, MemberLead } from '@/types'

interface Props {
  responsavel: string
}

type Etapa = 'entrada' | 'revisao'

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  padding: '10px 12px',
  fontSize: 14,
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: 'var(--text-secondary)',
}

function ConfiancaBadge({ nivel }: { nivel: ConfiancaNivel }) {
  const cfg = {
    alta: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.4)', color: 'var(--green)' },
    media: { bg: 'rgba(240,192,64,0.12)', border: 'rgba(240,192,64,0.4)', color: 'var(--accent)' },
    baixa: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', color: 'var(--red)' },
  }[nivel]
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 999,
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      {nivel}
    </span>
  )
}

export default function ProspectarForm({ responsavel }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('entrada')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)

  // Entrada
  const [email, setEmail] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [contexto, setContexto] = useState('')

  // Revisão
  const [extracao, setExtracao] = useState<ExtractionResult | null>(null)
  const [campos, setCampos] = useState({
    nome: '',
    cargo: '',
    empresa: '',
    setor: '',
    alvo: 'Conéctar' as 'Conéctar' | 'RD',
  })

  async function analisar() {
    setErro(null)
    setSucesso(null)
    if (!email.trim() && !linkedinUrl.trim() && !contexto.trim()) {
      setErro('Informe pelo menos email, URL do LinkedIn ou um contexto.')
      return
    }
    setCarregando(true)
    try {
      const res = await fetch('/api/member-leads/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, linkedin_url: linkedinUrl, contexto }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.detalhe ?? data.error ?? 'Falha ao analisar')
        return
      }
      const r = data as ExtractionResult
      setExtracao(r)
      setCampos({
        nome: r.nome ?? '',
        cargo: r.cargo ?? '',
        empresa: r.empresa ?? '',
        setor: r.setor ?? '',
        alvo: r.alvo,
      })
      setEtapa('revisao')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setCarregando(false)
    }
  }

  async function adicionar() {
    setErro(null)
    setSucesso(null)
    if (!campos.nome.trim() || !campos.empresa.trim()) {
      setErro('Nome e empresa são obrigatórios.')
      return
    }
    setCarregando(true)
    try {
      const lead: MemberLead = {
        nome: campos.nome.trim(),
        empresa: campos.empresa.trim(),
        setor: campos.setor.trim() || undefined,
        canal: linkedinUrl ? 'LinkedIn' : 'E-mail',
        email: email.trim() || undefined,
        linkedin_url: linkedinUrl.trim() || undefined,
        alvo: campos.alvo,
      }
      const res = await fetch('/api/member-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.detalhe ?? data.error ?? 'Falha ao adicionar')
        return
      }
      setSucesso(`Lead adicionado na aba "${responsavel}" (linha ${data.rowIndex}) com pitch gerado.`)
      // Limpa para nova prospecção
      setEmail('')
      setLinkedinUrl('')
      setContexto('')
      setExtracao(null)
      setCampos({ nome: '', cargo: '', empresa: '', setor: '', alvo: 'Conéctar' })
      setEtapa('entrada')
      // Avisa a lista de recentes para recarregar
      window.dispatchEvent(new CustomEvent('apollo:lead-added'))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado')
    } finally {
      setCarregando(false)
    }
  }

  function voltar() {
    setEtapa('entrada')
    setExtracao(null)
    setErro(null)
  }

  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {etapa === 'entrada' && (
        <>
          <label style={labelStyle}>
            Email do lead
            <input
              style={inputStyle}
              type="email"
              placeholder="ex: carlos@nestle.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label style={labelStyle}>
            URL do LinkedIn
            <input
              style={inputStyle}
              type="url"
              placeholder="ex: https://linkedin.com/in/fulano"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label style={labelStyle}>
            Contexto adicional (opcional)
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Ex: Diretor de TI, encontrei ele no evento X, empresa é uma varejista..."
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
            />
          </label>

          {erro && <ErroBox mensagem={erro} />}
          {sucesso && <SucessoBox mensagem={sucesso} />}

          <button onClick={analisar} disabled={carregando} style={primaryButton(carregando)}>
            {carregando ? 'Analisando...' : 'Analisar com IA'}
          </button>
        </>
      )}

      {etapa === 'revisao' && extracao && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 18 }}>Revise os dados extraídos</h2>
            <button onClick={voltar} style={secondaryButton}>← Voltar</button>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Campos com confiança <strong style={{ color: 'var(--red)' }}>baixa</strong> ou{' '}
            <strong style={{ color: 'var(--accent)' }}>média</strong> provavelmente precisam de
            ajuste. O <strong>cargo</strong> geralmente precisa ser preenchido manualmente.
          </p>

          <CampoEditavel
            label="Nome"
            valor={campos.nome}
            onChange={(v) => setCampos({ ...campos, nome: v })}
            confianca={extracao.confianca.nome}
          />
          <CampoEditavel
            label="Cargo"
            valor={campos.cargo}
            onChange={(v) => setCampos({ ...campos, cargo: v })}
          />
          <CampoEditavel
            label="Empresa"
            valor={campos.empresa}
            onChange={(v) => setCampos({ ...campos, empresa: v })}
            confianca={extracao.confianca.empresa}
          />
          <CampoEditavel
            label="Setor"
            valor={campos.setor}
            onChange={(v) => setCampos({ ...campos, setor: v })}
            confianca={extracao.confianca.setor}
          />

          <label style={labelStyle}>
            Alvo
            <select
              style={inputStyle}
              value={campos.alvo}
              onChange={(e) => setCampos({ ...campos, alvo: e.target.value as 'Conéctar' | 'RD' })}
            >
              <option value="Conéctar">Conéctar</option>
              <option value="RD">RD</option>
            </select>
          </label>

          {erro && <ErroBox mensagem={erro} />}

          <button onClick={adicionar} disabled={carregando} style={primaryButton(carregando)}>
            {carregando ? 'Adicionando e gerando pitch...' : `Adicionar à aba "${responsavel}"`}
          </button>
        </>
      )}
    </section>
  )
}

function CampoEditavel({
  label,
  valor,
  onChange,
  confianca,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  confianca?: ConfiancaNivel
}) {
  return (
    <label style={labelStyle}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {label}
        {confianca && <ConfiancaBadge nivel={confianca} />}
      </span>
      <input
        style={{
          ...inputStyle,
          borderColor:
            confianca === 'baixa'
              ? 'rgba(239,68,68,0.5)'
              : confianca === 'media'
              ? 'rgba(240,192,64,0.5)'
              : 'var(--border)',
        }}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function ErroBox({ mensagem }: { mensagem: string }) {
  return (
    <div
      role="alert"
      style={{
        color: 'var(--red)',
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.3)',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      {mensagem}
    </div>
  )
}

function SucessoBox({ mensagem }: { mensagem: string }) {
  return (
    <div
      role="status"
      style={{
        color: 'var(--green)',
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.3)',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      {mensagem}
    </div>
  )
}

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 16px',
    background: 'var(--accent)',
    color: '#0a0a0a',
    border: 'none',
    borderRadius: 8,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  }
}

const secondaryButton: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}
