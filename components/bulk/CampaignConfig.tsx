'use client'
import { CampaignConfig } from '@/types'

interface Props {
  config: CampaignConfig
  onChange: (config: CampaignConfig) => void
}

function Pills<T extends string>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding:      '6px 14px',
              borderRadius: 100,
              border:       `1px solid ${value === o.value ? 'var(--green-primary)' : 'var(--border)'}`,
              background:   value === o.value ? 'rgba(49,112,57,0.18)' : 'transparent',
              color:        value === o.value ? 'var(--cream)' : 'var(--text-muted)',
              fontSize:     12,
              fontFamily:   'Syne, sans-serif',
              fontWeight:   700,
              cursor:       'pointer',
              transition:   'all 0.15s',
              display:      'flex',
              alignItems:   'center',
              gap:          5,
            }}
          >
            {o.label}
            {o.sub && <span style={{ fontSize: 10, opacity: 0.7 }}>{o.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CampaignConfigPanel({ config, onChange }: Props) {
  const update = (key: keyof CampaignConfig, value: string | number) =>
    onChange({ ...config, [key]: value })

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--green-primary)' }}>
        Configuração da Campanha
      </div>

      {/* Seletor de IA — destaque */}
      <div style={{ background: '#0a0a0a', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 10 }}>
          Modelo de IA
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            { value: 'gemini', label: 'Gemini Flash', sub: 'Grátis', icon: '◈' },
            { value: 'claude', label: 'Claude Haiku', sub: '~$0,001/msg', icon: '◆' },
          ] as const).map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => update('ia', o.value)}
              style={{
                flex:         1,
                padding:      '10px 14px',
                borderRadius: 8,
                border:       `1px solid ${config.ia === o.value ? (o.value === 'gemini' ? '#4285f4' : 'var(--gold)') : 'var(--border)'}`,
                background:   config.ia === o.value ? (o.value === 'gemini' ? 'rgba(66,133,244,0.1)' : 'rgba(241,190,73,0.08)') : 'transparent',
                color:        config.ia === o.value ? (o.value === 'gemini' ? '#7ab3f7' : 'var(--gold)') : 'var(--text-muted)',
                fontSize:     13,
                fontFamily:   'Syne, sans-serif',
                fontWeight:   700,
                cursor:       'pointer',
                transition:   'all 0.15s',
                textAlign:    'left',
                display:      'flex',
                alignItems:   'center',
                gap:          8,
              }}
            >
              <span style={{ fontSize: 16 }}>{o.icon}</span>
              <span>
                {o.label}
                <span style={{ display: 'block', fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <Pills
        label="Canal"
        value={config.canal}
        options={[{ value: 'LinkedIn', label: 'LinkedIn' }, { value: 'Email', label: 'Email' }]}
        onChange={c => onChange({ ...config, canal: c, limite_caracteres: c === 'LinkedIn' ? 300 : 1500 })}
      />
      <Pills
        label="Tom"
        value={config.tom}
        options={[{ value: 'Formal', label: 'Formal' }, { value: 'Semiformal', label: 'Semiformal' }, { value: 'Direto', label: 'Direto' }]}
        onChange={t => update('tom', t)}
      />
      <Pills
        label="Metodologia"
        value={config.metodologia}
        options={[{ value: 'CLASSICA', label: 'Clássica' }, { value: 'AIDA', label: 'AIDA' }]}
        onChange={m => update('metodologia', m)}
      />

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Limite</span>
          <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--gold)' }}>{config.limite_caracteres} chars</span>
        </div>
        <input
          type="range" min={100} max={2000} step={50}
          value={config.limite_caracteres}
          onChange={e => update('limite_caracteres', Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--green-primary)' }}
        />
      </div>
    </div>
  )
}
