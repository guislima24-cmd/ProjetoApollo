'use client'
import { useState, useRef } from 'react'

interface Props {
  onFile: (file: File) => void
}

export default function UploadZone({ onFile }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv')) onFile(file)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
        background: dragging ? 'rgba(240,192,64,0.05)' : 'var(--bg-card)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
      className="rounded-xl p-12 text-center space-y-3"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      <div style={{ fontSize: '2.5rem' }}>📂</div>
      <div>
        <p style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1.1rem' }}>
          Arraste o CSV do Apollo aqui
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          ou clique para selecionar o arquivo
        </p>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        Exportado do Apollo.io ou LeadHunter · máx. 500 leads
      </p>
    </div>
  )
}
