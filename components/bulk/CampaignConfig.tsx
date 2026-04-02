'use client'
import { CampaignConfig } from '@/types'

interface Props {
  config: CampaignConfig
  onChange: (config: CampaignConfig) => void
}

export default function CampaignConfigPanel({ config, onChange }: Props) {
  const update = (key: keyof CampaignConfig, value: string | number) => {
    onChange({ ...config, [key]: value })
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} className="rounded-xl p-6 space-y-5">
      <h3 style={{ fontFamily: 'Syne, sans-serif', color: 'var(--accent)' }} className="text-sm font-700 uppercase tracking-widest">
        Configuração da Campanha
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Metodologia */}
        <div className="space-y-2">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }} className="block uppercase tracking-wider font-500">
            Metodologia
          </label>
          <div className="flex gap-2">
            {(['CLASSICA', 'AIDA'] as const).map(m => (
              <button
                key={m}
                onClick={() => update('metodologia', m)}
                style={{
                  background: config.metodologia === m ? 'var(--accent)' : 'var(--bg)',
                  color: config.metodologia === m ? '#000' : 'var(--text-secondary)',
                  border: `1px solid ${config.metodologia === m ? 'var(--accent)' : 'var(--border)'}`,
                  fontSize: '0.8rem',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700,
                }}
                className="flex-1 py-2 px-3 rounded-lg transition-all duration-200 cursor-pointer"
              >
                {m === 'CLASSICA' ? 'Clássica' : 'AIDA'}
              </button>
            ))}
          </div>
        </div>

        {/* Tom */}
        <div className="space-y-2">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }} className="block uppercase tracking-wider font-500">
            Tom
          </label>
          <div className="flex gap-2">
            {(['Formal', 'Semiformal', 'Direto'] as const).map(t => (
              <button
                key={t}
                onClick={() => update('tom', t)}
                style={{
                  background: config.tom === t ? 'var(--accent)' : 'var(--bg)',
                  color: config.tom === t ? '#000' : 'var(--text-secondary)',
                  border: `1px solid ${config.tom === t ? 'var(--accent)' : 'var(--border)'}`,
                  fontSize: '0.75rem',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700,
                }}
                className="flex-1 py-2 px-2 rounded-lg transition-all duration-200 cursor-pointer"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Canal */}
        <div className="space-y-2">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }} className="block uppercase tracking-wider font-500">
            Canal
          </label>
          <div className="flex gap-2">
            {(['LinkedIn', 'Email'] as const).map(c => (
              <button
                key={c}
                onClick={() => {
                  update('canal', c)
                  update('limite_caracteres', c === 'LinkedIn' ? 300 : 800)
                }}
                style={{
                  background: config.canal === c ? 'var(--accent)' : 'var(--bg)',
                  color: config.canal === c ? '#000' : 'var(--text-secondary)',
                  border: `1px solid ${config.canal === c ? 'var(--accent)' : 'var(--border)'}`,
                  fontSize: '0.8rem',
                  fontFamily: 'Syne, sans-serif',
                  fontWeight: 700,
                }}
                className="flex-1 py-2 px-3 rounded-lg transition-all duration-200 cursor-pointer"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Limite de caracteres */}
        <div className="space-y-2">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }} className="block uppercase tracking-wider font-500">
            Limite de Caracteres: <span style={{ color: 'var(--accent)' }}>{config.limite_caracteres}</span>
          </label>
          <input
            type="range"
            min={100}
            max={1000}
            step={50}
            value={config.limite_caracteres}
            onChange={e => update('limite_caracteres', Number(e.target.value))}
            style={{ accentColor: 'var(--accent)' }}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}
