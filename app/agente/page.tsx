'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type AgentState = 'idle' | 'scraping' | 'paused' | 'done' | 'error'
type AgentMode  = 'linkedin' | 'apollo' | 'maps' | 'csv'

interface DecisionMaker {
  name:        string
  role:        string
  profile_url: string | null
}

interface ProcessedLead {
  nome:               string
  cnpj:               string | null
  setor:              string
  porte:              string | null
  cidade:             string
  email:              string | null
  telefone:           string | null
  linkedin_url:       string | null
  employees_count:    string | null
  decision_makers:    DecisionMaker[]
  potencial:          string | null
  justificativa:      string | null
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  argumento_abertura: string | null
  emails:             string[]
  ok:                 boolean
}

interface ApolloLead {
  nome:               string
  setor:              string
  porte:              string | null
  cidade:             string | null
  funcionarios:       string | null
  website:            string | null
  apollo_url:         string | null
  linkedin_url:       string | null
  email:              string | null
  telefone:           string | null
  cnpj:               string | null
  potencial:          string | null
  justificativa:      string | null
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  argumento_abertura: string | null
  score_fit:          number | null
  emails:             string[]
  decision_makers:    DecisionMaker[]
  ok:                 boolean
}

interface MapsLead {
  nome:               string
  setor:              string
  cidade:             string
  endereco:           string
  telefone_br:        string | null
  telefone_intl:      string | null
  site:               string | null
  horario:            string | null
  potencial:          string | null
  justificativa:      string | null
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  melhor_canal:       string | null
  melhor_horario:     string | null
  argumento_abertura: string | null
  ok:                 boolean
}

interface CsvCompany {
  nome:          string
  setor:         string | null
  cidade:        string | null
  funcionarios:  string | null
  website:       string | null
  linkedin_url:  string | null
  telefone:      string | null
  email:         string | null
}

interface CsvLead extends CsvCompany {
  potencial:          string | null
  score_fit:          number | null
  justificativa:      string | null
  dores_tipicas:      string[]
  servicos_sugeridos: string[]
  melhor_canal:       string | null
  argumento_abertura: string | null
  ok:                 boolean
}

const SECTORS = [
  'TI', 'Tecnologia', 'Construção Civil', 'Educação', 'Saúde',
  'Varejo', 'Logística', 'Indústria', 'Alimentação', 'Consultoria',
  'Marketing', 'Financeiro', 'Imobiliário', 'Jurídico', 'Contabilidade',
]

const REGIONS = [
  'São Paulo', 'São Bernardo do Campo', 'Santo André', 'São Caetano do Sul',
  'Diadema', 'Mauá', 'Ribeirão Pires', 'Rio Grande da Serra',
  'Guarulhos', 'Campinas', 'Barueri', 'Osasco',
]

const PORTES = ['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE']

const MAPS_CITIES = [
  'Santo André', 'São Bernardo do Campo', 'São Caetano do Sul',
  'Mauá', 'Diadema', 'Ribeirão Pires',
  'São Paulo', 'Guarulhos', 'Campinas', 'Barueri', 'Osasco',
]

const MAPS_SECTORS = [
  'Indústria química', 'Construção civil', 'Consultoria de engenharia',
  'Manufatura', 'TI', 'Alimentação', 'Saúde', 'Educação',
  'Logística', 'Varejo', 'Imobiliário', 'Jurídico',
]

function potencialColor(p: string | null) {
  if (p === 'Alto'  || p === 'alto')  return '#22c55e'
  if (p === 'Médio' || p === 'medio') return '#f59e0b'
  if (p === 'Baixo' || p === 'baixo') return '#ef4444'
  return '#888'
}

export default function AgentePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [mode, setMode] = useState<AgentMode>('linkedin')

  const [extId,       setExtId]       = useState('')
  const [extStatus,   setExtStatus]   = useState<'unknown' | 'connected' | 'disconnected'>('unknown')

  const [setor,   setSetor]   = useState('')
  const [regioes, setRegioes] = useState<string[]>([])
  const [portes,  setPortes]  = useState<string[]>([])
  const [limite,  setLimite]  = useState(10)

  const [agentState,  setAgentState]  = useState<AgentState>('idle')
  const [leads,       setLeads]       = useState<ProcessedLead[]>([])
  const [progress,    setProgress]    = useState({ done: 0, total: 0 })
  const [pauseReason, setPauseReason] = useState<string | null>(null)
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const [localizacao, setLocalizacao] = useState('')
  const [showIdTooltip, setShowIdTooltip] = useState(false)

  // Apollo mode state
  const [apolloState,      setApolloState]      = useState<AgentState>('idle')
  const [apolloLeads,      setApolloLeads]      = useState<ApolloLead[]>([])
  const [apolloProgress,   setApolloProgress]   = useState({ done: 0, total: 0 })
  const [apolloPauseReason,setApolloPauseReason] = useState<string | null>(null)
  const [apolloErrorMsg,   setApolloErrorMsg]   = useState<string | null>(null)
  const [apolloExpandedIdx,setApolloExpandedIdx] = useState<number | null>(null)

  // Maps mode state
  const [mapsState,       setMapsState]       = useState<AgentState>('idle')
  const [mapsLeads,       setMapsLeads]       = useState<MapsLead[]>([])
  const [mapsProgress,    setMapsProgress]    = useState({ done: 0, total: 0 })
  const [mapsErrorMsg,    setMapsErrorMsg]    = useState<string | null>(null)
  const [mapsExpandedIdx, setMapsExpandedIdx] = useState<number | null>(null)
  const [mapsAiError,     setMapsAiError]     = useState<string | null>(null)
  const [geminiTestResult, setGeminiTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testingGemini,   setTestingGemini]   = useState(false)

  // Maps filters
  const [mapsCidades,  setMapsCidades]  = useState<string[]>([])
  const [mapsSetor,    setMapsSetor]    = useState('')
  const [mapsLimite,   setMapsLimite]   = useState(20)
  const [mapsUseAI,    setMapsUseAI]    = useState(true)

  // CSV mode state
  const [csvState,       setCsvState]       = useState<AgentState>('idle')
  const [csvLeads,       setCsvLeads]       = useState<CsvLead[]>([])
  const [csvProgress,    setCsvProgress]    = useState({ done: 0, total: 0 })
  const [csvErrorMsg,    setCsvErrorMsg]    = useState<string | null>(null)
  const [csvExpandedIdx, setCsvExpandedIdx] = useState<number | null>(null)
  const [csvFile,        setCsvFile]        = useState<File | null>(null)
  const [csvParsed,      setCsvParsed]      = useState<CsvCompany[]>([])

  // Maps usage widget
  const [mapsUsage, setMapsUsage] = useState<{
    totalCost:        number
    percentUsed:      number
    totalCalls:       number
    callsByType:      { text_search: number; place_details: number }
    daysUntilReset:   number
    limit:            number
    warning:          boolean
    blocked:          boolean
    apiKeyConfigured: boolean
  } | null>(null)

  const pollRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const apolloPollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const mapsAbortRef     = useRef<AbortController | null>(null)
  const csvPollRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const csvQueueRef      = useRef<CsvCompany[]>([])
  const csvProcessingRef = useRef(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('agent_ext_id') ?? ''
    const envId = process.env.NEXT_PUBLIC_EXTENSION_ID ?? ''
    setExtId(saved || envId)
  }, [])

  async function pingExtension(id: string) {
    const cr = (window as any).chrome?.runtime
    if (!id || !cr) { setExtStatus('disconnected'); return }
    try {
      const result = await new Promise<{ ok?: boolean } | null>(resolve => {
        cr.sendMessage(id, { type: 'AGENT_PING' }, (res: any) => {
          if (cr.lastError) resolve(null)
          else resolve(res)
        })
      })
      setExtStatus(result?.ok ? 'connected' : 'disconnected')
    } catch {
      setExtStatus('disconnected')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (extId) pingExtension(extId) }, [extId])

  function sendToExt(message: object): Promise<any> {
    const cr = (window as any).chrome?.runtime
    if (!extId || extId.length !== 32) {
      console.error('[APOLLO_AGENT] EXTENSION_ID inválido ou ausente:', extId)
      return Promise.resolve(null)
    }
    return new Promise(resolve => {
      cr.sendMessage(extId, message, (res: any) => {
        if (cr.lastError) resolve(null)
        else resolve(res)
      })
    })
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const res = await sendToExt({ type: 'AGENT_GET_RESULTS' })
      if (!res?.ok) return

      setProgress(res.progress ?? { done: 0, total: 0 })
      setPauseReason(res.pauseReason ?? null)

      if (res.results?.length) {
        setLeads(prev => [...prev, ...res.results])
      }

      if (res.state === 'done' || res.state === 'error' || res.state === 'paused') {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setAgentState(
          res.state === 'paused' ? 'paused' :
          res.state === 'done'   ? 'done'   : 'error'
        )
        if (res.errorMessage) setErrorMsg(res.errorMessage)
      }
    }, 2000)
  }

  function startApolloPolling() {
    if (apolloPollRef.current) clearInterval(apolloPollRef.current)
    apolloPollRef.current = setInterval(async () => {
      const res = await sendToExt({ type: 'APOLLO_GET_RESULTS' })
      if (!res?.ok) return

      setApolloProgress(res.progress ?? { done: 0, total: 0 })
      setApolloPauseReason(res.pauseReason ?? null)

      if (res.results?.length) {
        setApolloLeads(prev => [...prev, ...res.results])
      }

      if (res.state === 'done' || res.state === 'error' || res.state === 'paused') {
        clearInterval(apolloPollRef.current!)
        apolloPollRef.current = null
        setApolloState(
          res.state === 'paused' ? 'paused' :
          res.state === 'done'   ? 'done'   : 'error'
        )
        if (res.errorMessage) setApolloErrorMsg(res.errorMessage)
      }
    }, 2000)
  }

  async function handleStart() {
    if (!extId || extStatus !== 'connected') return

    setLeads([])
    setProgress({ done: 0, total: 0 })
    setErrorMsg(null)
    setPauseReason(null)
    setExpandedIdx(null)
    setAgentState('scraping')

    const queueRes = await sendToExt({
      type: 'AGENT_SCRAPE_QUEUE',
      searchParams: { setor, regioes, limite, portes },
    })

    if (!queueRes?.ok) {
      setErrorMsg(queueRes?.error ?? 'Erro ao iniciar o agente. Verifique se a extensão está ativa.')
      setAgentState('error')
      return
    }

    setProgress({ done: 0, total: queueRes.target ?? limite })
    startPolling()
  }

  async function handlePause() {
    await sendToExt({ type: 'AGENT_PAUSE' })
    setAgentState('paused')
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleResume() {
    await sendToExt({ type: 'AGENT_RESUME' })
    setAgentState('scraping')
    startPolling()
  }

  async function handleClear() {
    await sendToExt({ type: 'AGENT_CLEAR' })
    setLeads([])
    setProgress({ done: 0, total: 0 })
    setAgentState('idle')
    setErrorMsg(null)
    setPauseReason(null)
    setExpandedIdx(null)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleApolloStart() {
    if (!extId || extStatus !== 'connected') return

    setApolloLeads([])
    setApolloProgress({ done: 0, total: 0 })
    setApolloErrorMsg(null)
    setApolloPauseReason(null)
    setApolloExpandedIdx(null)
    setApolloState('scraping')

    const queueRes = await sendToExt({
      type: 'APOLLO_SCRAPE_QUEUE',
      searchParams: { setor, portes, limite, localizacao: localizacao.trim() || null },
    })

    if (!queueRes?.ok) {
      setApolloErrorMsg(queueRes?.error ?? 'Erro ao iniciar o agente Apollo.')
      setApolloState('error')
      return
    }

    setApolloProgress({ done: 0, total: queueRes.target ?? limite })
    startApolloPolling()
  }

  async function handleApolloPause() {
    await sendToExt({ type: 'APOLLO_PAUSE' })
    setApolloState('paused')
    if (apolloPollRef.current) { clearInterval(apolloPollRef.current); apolloPollRef.current = null }
  }

  async function handleApolloResume() {
    await sendToExt({ type: 'APOLLO_RESUME' })
    setApolloState('scraping')
    startApolloPolling()
  }

  async function handleApolloClear() {
    await sendToExt({ type: 'APOLLO_CLEAR' })
    setApolloLeads([])
    setApolloProgress({ done: 0, total: 0 })
    setApolloState('idle')
    setApolloErrorMsg(null)
    setApolloPauseReason(null)
    setApolloExpandedIdx(null)
    if (apolloPollRef.current) { clearInterval(apolloPollRef.current); apolloPollRef.current = null }
  }

  async function fetchMapsUsage() {
    try {
      const res = await fetch('/api/agent/maps-usage')
      if (res.ok) setMapsUsage(await res.json())
    } catch {}
  }

  async function handleMapsStart() {
    if (mapsAbortRef.current) mapsAbortRef.current.abort()
    const ctrl = new AbortController()
    mapsAbortRef.current = ctrl

    setMapsLeads([])
    setMapsProgress({ done: 0, total: mapsCidades.length * mapsLimite })
    setMapsErrorMsg(null)
    setMapsAiError(null)
    setGeminiTestResult(null)
    setMapsExpandedIdx(null)
    setMapsState('scraping')

    try {
      const res = await fetch('/api/agent/start-maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setor: mapsSetor, cidades: mapsCidades, limite: mapsLimite, useAI: mapsUseAI }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
        setMapsErrorMsg((err as any).error ?? 'Erro ao iniciar busca')
        setMapsState('error')
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let found = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as any
            if (event.type === 'company_found') {
              found++
              setMapsProgress(p => ({ ...p, done: found }))
            } else if (event.type === 'lead_saved' && event.lead) {
              setMapsLeads(prev => [...prev, event.lead as MapsLead])
            } else if (event.type === 'done') {
              setMapsState(event.total_saved > 0 ? 'done' : 'error')
              setMapsProgress({ done: event.total_saved, total: event.total_found || found })
              fetchMapsUsage()
            } else if (event.type === 'ai_warning') {
              setMapsAiError(event.error ?? 'Erro desconhecido na API Gemini')
            } else if (event.type === 'error' && event.blocked) {
              setMapsErrorMsg(event.message)
            }
          } catch {}
        }
      }
      if (mapsState === 'scraping') setMapsState('done')
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setMapsErrorMsg(String(err))
      setMapsState('error')
    }
  }

  function handleMapsClear() {
    mapsAbortRef.current?.abort()
    setMapsLeads([])
    setMapsProgress({ done: 0, total: 0 })
    setMapsState('idle')
    setMapsErrorMsg(null)
    setMapsAiError(null)
    setGeminiTestResult(null)
    setMapsExpandedIdx(null)
  }

  async function testGemini() {
    setTestingGemini(true)
    setGeminiTestResult(null)
    try {
      const res  = await fetch('/api/test-gemini')
      const data = await res.json() as {
        ok: boolean; error?: string; fix?: string; status?: number
        model_tested?: string; flash_models?: string[]; message?: string
      }
      const models = data.flash_models?.join(', ') ?? ''
      if (data.ok) {
        setGeminiTestResult({ ok: true, msg: `✓ ${data.model_tested} funcionando${models ? ` | Flash disponíveis: ${models}` : ''}` })
      } else {
        setGeminiTestResult({ ok: false, msg: `${data.fix ?? data.error ?? 'Erro desconhecido'}${models ? `\nModelos flash na sua chave: ${models}` : ''}` })
      }
    } catch (err) {
      setGeminiTestResult({ ok: false, msg: `Falha na requisição: ${String(err)}` })
    } finally {
      setTestingGemini(false)
    }
  }

  // ── CSV mode helpers ─────────────────────────────────────────────────────────

  function parseCSVRow(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  function parseApolloCsv(text: string): CsvCompany[] {
    // Split em linhas respeitando campos quoted com quebras de linha internas
    const cleaned = text.replace(/^﻿/, '')
    const lines: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (ch === '"') {
        if (inQuotes && cleaned[i + 1] === '"') { current += '""'; i++ }
        else inQuotes = !inQuotes
        current += ch
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && cleaned[i + 1] === '\n') i++
        if (current.trim()) lines.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    if (current.trim()) lines.push(current)

    if (lines.length < 2) return []

    const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9# ]/g, '').trim())

    const find = (...names: string[]) => {
      for (const name of names) {
        const idx = headers.findIndex(h => h.includes(name))
        if (idx >= 0) return idx
      }
      return -1
    }

    const cols = {
      nome:         find('company name', 'company', 'name'),
      linkedin:     find('company linkedin', 'linkedin url', 'linkedin'),
      website:      find('website'),
      setor:        find('industry'),
      funcionarios: find('# employees', 'employees', 'headcount'),
      cidade:       find('city'),
      estado:       find('state'),
      telefone:     find('phone', 'direct phone', 'corporate phone'),
      email:        find('email'),
    }

    return lines.slice(1)
      .map(line => parseCSVRow(line))
      .filter(row => (row[cols.nome] ?? '').trim().length >= 2)
      .map(row => ({
        nome:         (row[cols.nome]           ?? '').trim(),
        linkedin_url: cols.linkedin     >= 0 ? (row[cols.linkedin]     ?? '').trim() || null : null,
        website:      cols.website      >= 0 ? (row[cols.website]      ?? '').trim() || null : null,
        setor:        cols.setor        >= 0 ? (row[cols.setor]        ?? '').trim() || null : null,
        funcionarios: cols.funcionarios >= 0 ? (row[cols.funcionarios] ?? '').trim() || null : null,
        cidade:       [
          cols.cidade >= 0 ? (row[cols.cidade] ?? '').trim() : '',
          cols.estado >= 0 ? (row[cols.estado] ?? '').trim() : '',
        ].filter(Boolean).join(', ') || null,
        telefone:     cols.telefone     >= 0 ? (row[cols.telefone]     ?? '').trim() || null : null,
        email:        cols.email        >= 0 ? (row[cols.email]        ?? '').trim() || null : null,
      }))
  }

  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setCsvFile(file)
    setCsvParsed([])
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const companies = parseApolloCsv(text)
      setCsvParsed(companies)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function processCsvQueue() {
    if (csvProcessingRef.current) return
    csvProcessingRef.current = true
    while (csvQueueRef.current.length > 0) {
      const company = csvQueueRef.current.shift()!
      try {
        const apiRes = await fetch('/api/agent/process-csv', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(company),
        })
        if (apiRes.ok) {
          const data = await apiRes.json() as { lead?: CsvLead }
          if (data.lead) setCsvLeads(prev => [...prev, data.lead!])
        }
      } catch (err) {
        console.error('[CSV] process-csv error:', err)
      }
    }
    csvProcessingRef.current = false
  }

  function startCsvPolling() {
    if (csvPollRef.current) clearInterval(csvPollRef.current)
    csvPollRef.current = setInterval(async () => {
      const res = await sendToExt({ type: 'CSV_GET_RESULTS' })
      if (!res?.ok) return

      setCsvProgress(res.progress ?? { done: 0, total: 0 })

      if (res.results?.length) {
        csvQueueRef.current.push(...res.results)
        processCsvQueue()
      }

      if (res.state === 'done' || res.state === 'error') {
        clearInterval(csvPollRef.current!)
        csvPollRef.current = null
        setCsvState(res.state === 'done' ? 'done' : 'error')
        if (res.errorMessage) setCsvErrorMsg(res.errorMessage)
      }
    }, 2000)
  }

  async function handleCsvStart() {
    if (!extId || extStatus !== 'connected' || !csvParsed.length) return

    setCsvLeads([])
    setCsvProgress({ done: 0, total: csvParsed.length })
    setCsvErrorMsg(null)
    setCsvExpandedIdx(null)
    csvQueueRef.current = []
    csvProcessingRef.current = false
    setCsvState('scraping')

    const res = await sendToExt({ type: 'CSV_PROCESS_QUEUE', queue: csvParsed })
    if (!res?.ok) {
      setCsvErrorMsg(res?.error ?? 'Erro ao enviar fila para a extensão.')
      setCsvState('error')
      return
    }

    setCsvProgress({ done: 0, total: res.total ?? csvParsed.length })
    startCsvPolling()
  }

  async function handleCsvPause() {
    await sendToExt({ type: 'CSV_PAUSE' })
    setCsvState('paused')
    if (csvPollRef.current) { clearInterval(csvPollRef.current); csvPollRef.current = null }
  }

  async function handleCsvResume() {
    await sendToExt({ type: 'CSV_RESUME' })
    setCsvState('scraping')
    startCsvPolling()
  }

  async function handleCsvClear() {
    await sendToExt({ type: 'CSV_CLEAR' })
    setCsvLeads([])
    setCsvProgress({ done: 0, total: 0 })
    setCsvState('idle')
    setCsvErrorMsg(null)
    setCsvExpandedIdx(null)
    csvQueueRef.current = []
    if (csvPollRef.current) { clearInterval(csvPollRef.current); csvPollRef.current = null }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'maps') fetchMapsUsage() }, [mode])

  useEffect(() => () => {
    if (pollRef.current)      clearInterval(pollRef.current)
    if (apolloPollRef.current) clearInterval(apolloPollRef.current)
    if (csvPollRef.current)   clearInterval(csvPollRef.current)
    mapsAbortRef.current?.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === 'loading') return null

  const canStart       = !!setor && regioes.length > 0 && extStatus === 'connected'
  const canApolloStart = !!setor && extStatus === 'connected'
  const canMapsStart   = !!mapsSetor && mapsCidades.length > 0 && mapsState !== 'scraping' && !mapsUsage?.blocked
  const canCsvStart    = csvParsed.length > 0 && extStatus === 'connected' && csvState !== 'scraping'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>

      {/* Título */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0 }}>
          ✦ Agente Autônomo
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
          Descobre empresas por setor automaticamente e enriquece com CNPJ, email e análise IA.
          Requer a extensão ProspectAI instalada.
        </p>
      </div>

      {/* Seletor de modo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['linkedin', 'apollo', 'maps', 'csv'] as AgentMode[]).map(m => {
          const isActive = mode === m
          const color = m === 'maps' ? '#14b8a6' : m === 'csv' ? '#f97316' : 'var(--green-primary)'
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1px solid ${isActive ? color : 'var(--border)'}`,
                background: isActive ? `${color}2e` : 'transparent',
                color: isActive ? color : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {m === 'linkedin' ? '🔗 LinkedIn' : m === 'apollo' ? '🚀 Apollo.io' : m === 'maps' ? '🗺️ Google Maps' : '📄 Apollo CSV'}
            </button>
          )
        })}
      </div>

      {/* Conexão com extensão */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p className="section-label" style={{ margin: 0 }}>Extensão Chrome</p>
          <button
            onClick={() => setShowIdTooltip(v => !v)}
            style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            Como pegar o ID?
          </button>
        </div>
        {showIdTooltip && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <strong>Passo a passo:</strong><br/>
            1. Instale a extensão ProspectAI (baixe em <strong>/instalar</strong>)<br/>
            2. Acesse <strong>chrome://extensions</strong> no Chrome<br/>
            3. Ative o <strong>Modo Desenvolvedor</strong> (toggle no canto superior direito)<br/>
            4. Localize <em>ProspectAI — UFABC Júnior</em> e copie o ID exibido abaixo do nome<br/>
            5. Cole o ID no campo abaixo e clique em <strong>Testar</strong>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input"
            value={extId}
            onChange={e => {
              setExtId(e.target.value)
              localStorage.setItem('agent_ext_id', e.target.value)
            }}
            placeholder="ID da extensão (ex: abcdefghijklmnop…)"
            style={{ flex: 1, minWidth: 220, fontSize: 12, fontFamily: 'monospace' }}
          />
          <button
            className="btn-secondary"
            onClick={() => pingExtension(extId)}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            Testar
          </button>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: extStatus === 'connected'    ? 'var(--green-primary)' :
                   extStatus === 'disconnected' ? '#ef4444' : 'var(--text-muted)',
          }}>
            {extStatus === 'connected'    ? '● Conectado'    :
             extStatus === 'disconnected' ? '● Desconectado' : '●'}
          </span>
        </div>
        {extStatus === 'disconnected' && (
          <p style={{ fontSize: 12, color: '#ef4444', marginTop: 10, lineHeight: 1.6 }}>
            {!extId || extId.length !== 32
              ? '❌ EXTENSION_ID não configurado — cole o ID acima ou configure NEXT_PUBLIC_EXTENSION_ID no .env'
              : `❌ Extensão não responde — verifique se o ID "${extId.slice(0, 8)}…" está correto em chrome://extensions/`
            }
          </p>
        )}
      </div>

      {/* Filtros (compartilhados entre modos) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: mode === 'csv' ? 'none' : 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

          {/* Setor */}
          <div>
            <label className="section-label">Setor *</label>
            <select
              className="input"
              value={setor}
              onChange={e => setSetor(e.target.value)}
              style={{ width: '100%', marginTop: 8 }}
            >
              <option value="">Selecione…</option>
              {SECTORS.map(s => (
                <option key={s} value={s.toLowerCase()}>{s}</option>
              ))}
            </select>
          </div>

          {/* Limite */}
          <div>
            <label className="section-label">Limite: {limite} empresas</label>
            <input
              type="range" min={5} max={20} step={5}
              value={limite}
              onChange={e => setLimite(Number(e.target.value))}
              style={{ width: '100%', marginTop: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>5</span><span>10</span><span>15</span><span>20</span>
            </div>
          </div>

          {/* Regiões — só no modo LinkedIn */}
          {mode === 'linkedin' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="section-label">Regiões *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {REGIONS.map(r => {
                  const active = regioes.includes(r)
                  return (
                    <button
                      key={r}
                      onClick={() => setRegioes(p => active ? p.filter(x => x !== r) : [...p, r])}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12,
                        border: `1px solid ${active ? 'var(--green-primary)' : 'var(--border)'}`,
                        background: active ? 'rgba(49,112,57,0.15)' : 'transparent',
                        color: active ? 'var(--green-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                      }}
                    >
                      {r}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Apollo: filtro de localização */}
          {mode === 'apollo' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="section-label">Localização (opcional)</label>
              <input
                className="input"
                value={localizacao}
                onChange={e => setLocalizacao(e.target.value)}
                placeholder="Ex: São Paulo, Rio de Janeiro, Curitiba…"
                style={{ width: '100%', marginTop: 8, fontSize: 13 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {['São Paulo', 'Rio de Janeiro', 'Curitiba', 'Belo Horizonte', 'Porto Alegre', 'Campinas', 'Brasília', 'Brasil'].map(c => (
                  <button
                    key={c}
                    onClick={() => setLocalizacao(localizacao === c ? '' : c)}
                    style={{
                      padding: '4px 10px', borderRadius: 16, fontSize: 11,
                      border: `1px solid ${localizacao === c ? '#818cf8' : 'var(--border)'}`,
                      background: localizacao === c ? 'rgba(99,102,241,0.15)' : 'transparent',
                      color: localizacao === c ? '#818cf8' : 'var(--text-muted)',
                      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Google Maps: filtros específicos */}
          {mode === 'maps' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, color: '#14b8a6', marginBottom: 12, fontWeight: 600 }}>
                ✅ Este modo funciona sem extensão Chrome — busca feita diretamente via Google Places API.
              </div>

              {mapsUsage && !mapsUsage.apiKeyConfigured && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#f59e0b' }}>
                  ⚠️ Configure <strong>GOOGLE_PLACES_API_KEY</strong> no .env para usar este modo.
                  Acesse console.cloud.google.com → ativar "Places API (New)" → Credenciais → Criar chave API.
                </div>
              )}

              {mapsUsage && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)' }}>📊 Uso do mês — Google Maps</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Renova em {mapsUsage.daysUntilReset} dias</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: mapsUsage.percentUsed >= 75 ? '#ef4444' : mapsUsage.percentUsed >= 50 ? '#f59e0b' : 'var(--text-secondary)', marginBottom: 6 }}>
                    <span>Custo: ${mapsUsage.totalCost.toFixed(2)} / ${mapsUsage.limit.toFixed(2)} (limite seguro)</span>
                    <span style={{ fontWeight: 700 }}>{Math.round(mapsUsage.percentUsed)}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: mapsUsage.percentUsed >= 75 ? '#ef4444' : mapsUsage.percentUsed >= 50 ? '#f59e0b' : '#14b8a6',
                      width: `${Math.min(mapsUsage.percentUsed, 100)}%`, transition: 'width 0.4s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 14 }}>
                    <span>Buscas: {mapsUsage.callsByType.text_search}</span>
                    <span>Detalhes: {mapsUsage.callsByType.place_details}</span>
                    <span>Empresas este mês: ~{mapsUsage.callsByType.place_details}</span>
                  </div>
                  {mapsUsage.blocked && (
                    <p style={{ fontSize: 12, color: '#ef4444', margin: '8px 0 0', fontWeight: 600 }}>
                      🚫 Limite de segurança atingido. Aguarde o próximo mês ou aumente MAPS_SAFE_LIMIT_USD no .env.
                    </p>
                  )}
                  {!mapsUsage.blocked && mapsUsage.warning && (
                    <p style={{ fontSize: 12, color: '#f59e0b', margin: '8px 0 0' }}>
                      ⚠️ Atenção: uso acima de 50%. Restam ${(mapsUsage.limit - mapsUsage.totalCost).toFixed(2)} antes do limite de segurança.
                    </p>
                  )}
                </div>
              )}

              <label className="section-label">Setor / Tipo de negócio *</label>
              <input
                className="input"
                value={mapsSetor}
                onChange={e => setMapsSetor(e.target.value)}
                placeholder="Ex: Indústria química, Construção civil, TI…"
                style={{ width: '100%', marginTop: 8, fontSize: 13 }}
                list="maps-sectors-list"
              />
              <datalist id="maps-sectors-list">
                {MAPS_SECTORS.map(s => <option key={s} value={s} />)}
              </datalist>

              <label className="section-label" style={{ display: 'block', marginTop: 14 }}>Cidades *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {MAPS_CITIES.map(c => {
                  const active = mapsCidades.includes(c)
                  return (
                    <button
                      key={c}
                      onClick={() => setMapsCidades(p => active ? p.filter(x => x !== c) : [...p, c])}
                      style={{
                        padding: '4px 10px', borderRadius: 16, fontSize: 11,
                        border: `1px solid ${active ? '#14b8a6' : 'var(--border)'}`,
                        background: active ? 'rgba(20,184,166,0.15)' : 'transparent',
                        color: active ? '#14b8a6' : 'var(--text-muted)',
                        cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>

              <div style={{ marginTop: 14 }}>
                <label className="section-label">Resultados por cidade: {mapsLimite}</label>
                <input
                  type="range" min={5} max={20} step={5}
                  value={mapsLimite}
                  onChange={e => setMapsLimite(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 8 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>5</span><span>10</span><span>15</span><span>20</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <button
                  onClick={() => setMapsUseAI(v => !v)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                    background: mapsUseAI ? '#14b8a6' : 'var(--border)',
                    border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: mapsUseAI ? 18 : 2,
                    width: 16, height: 16, borderRadius: 8, background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </button>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Enriquecer com análise IA {mapsUseAI ? '(ativo)' : '(desativado)'}
                </span>
              </div>

              {/* Diagnóstico Gemini */}
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={testGemini}
                  disabled={testingGemini}
                  style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--text-secondary)', cursor: testingGemini ? 'wait' : 'pointer',
                  }}
                >
                  {testingGemini ? 'Testando…' : '⚡ Testar conexão Gemini'}
                </button>
                {geminiTestResult && (
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: geminiTestResult.ok ? '#4ade80' : '#f87171',
                    maxWidth: 460, whiteSpace: 'pre-wrap', lineHeight: 1.4,
                  }}>
                    {geminiTestResult.msg}
                  </span>
                )}
              </div>

              {/* Aviso de erro de IA durante busca */}
              {mapsAiError && (
                <div style={{
                  marginTop: 10, padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
                  fontSize: 12, color: '#f87171', lineHeight: 1.5,
                }}>
                  <strong>⚠ Erro na análise de IA:</strong> {mapsAiError}<br />
                  <span style={{ color: 'var(--text-muted)' }}>Leads foram salvos sem pontuação. Clique em "Testar conexão Gemini" para diagnosticar.</span>
                </div>
              )}

              {mapsCidades.length > 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                  Estimativa de custo: ~${((mapsCidades.length * 0.04) + (mapsCidades.length * mapsLimite * 0.017)).toFixed(3)} para esta busca
                  ({mapsCidades.length} cidade{mapsCidades.length !== 1 ? 's' : ''} × {mapsLimite} resultados)
                </p>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                Ideal para ligações frias e WhatsApp — foca em telefones verificados de empresas operacionais.
              </p>
            </div>
          )}

          {/* Portes */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="section-label">Porte (opcional — vazio = todos)</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {PORTES.map(p => {
                const active = portes.includes(p)
                return (
                  <button
                    key={p}
                    onClick={() => setPortes(prev => active ? prev.filter(x => x !== p) : [...prev, p])}
                    style={{
                      padding: '5px 14px', borderRadius: 20, fontSize: 12,
                      border: `1px solid ${active ? 'var(--green-primary)' : 'var(--border)'}`,
                      background: active ? 'rgba(49,112,57,0.15)' : 'transparent',
                      color: active ? 'var(--green-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Botões de controle — LinkedIn */}
        {mode === 'linkedin' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' }}>
            {(agentState === 'idle' || agentState === 'done' || agentState === 'error') && (
              <button
                className="btn-primary"
                onClick={handleStart}
                disabled={!canStart}
                style={{ opacity: canStart ? 1 : 0.4 }}
              >
                {agentState === 'idle' ? '▶ Iniciar Agente' : '▶ Nova Busca'}
              </button>
            )}

            {agentState === 'scraping' && (
              <button className="btn-secondary" onClick={handlePause}>⏸ Pausar</button>
            )}

            {agentState === 'paused' && (
              <>
                <button className="btn-primary" onClick={handleResume}>▶ Retomar</button>
                <span style={{ fontSize: 12, color: '#f59e0b' }}>
                  {pauseReason === 'login'   ? '⚠ Faça login no LinkedIn e retome' :
                   pauseReason === 'captcha' ? '⚠ Resolva o captcha no LinkedIn e retome' :
                   '⏸ Pausado'}
                </span>
              </>
            )}

            {leads.length > 0 && agentState !== 'scraping' && (
              <button
                onClick={handleClear}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 7,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans',
                }}
              >
                🗑 Limpar
              </button>
            )}
          </div>
        )}

        {/* Botões de controle — Apollo */}
        {mode === 'apollo' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' }}>
            {(apolloState === 'idle' || apolloState === 'done' || apolloState === 'error') && (
              <button
                className="btn-primary"
                onClick={handleApolloStart}
                disabled={!canApolloStart}
                style={{ opacity: canApolloStart ? 1 : 0.4 }}
              >
                {apolloState === 'idle' ? '🚀 Iniciar Apollo' : '🚀 Nova Busca'}
              </button>
            )}

            {apolloState === 'scraping' && (
              <button className="btn-secondary" onClick={handleApolloPause}>⏸ Pausar</button>
            )}

            {apolloState === 'paused' && (
              <>
                <button className="btn-primary" onClick={handleApolloResume}>▶ Retomar</button>
                <span style={{ fontSize: 12, color: '#f59e0b' }}>
                  {apolloPauseReason === 'login' ? '⚠ Faça login no Apollo.io e retome' : '⏸ Pausado'}
                </span>
              </>
            )}

            {apolloLeads.length > 0 && apolloState !== 'scraping' && (
              <button
                onClick={handleApolloClear}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 7,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans',
                }}
              >
                🗑 Limpar
              </button>
            )}
          </div>
        )}

        {/* Botões de controle — Google Maps */}
        {mode === 'maps' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' }}>
            {(mapsState === 'idle' || mapsState === 'done' || mapsState === 'error') && (
              <button
                onClick={handleMapsStart}
                disabled={!canMapsStart}
                style={{
                  padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: canMapsStart ? '#14b8a6' : 'var(--border)',
                  color: canMapsStart ? '#fff' : 'var(--text-muted)',
                  border: 'none', cursor: canMapsStart ? 'pointer' : 'not-allowed',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {mapsState === 'idle' ? '🗺️ Buscar via Google Maps' : '🗺️ Nova Busca'}
              </button>
            )}

            {mapsState === 'scraping' && (
              <button
                className="btn-secondary"
                onClick={() => {
                  mapsAbortRef.current?.abort()
                  setMapsState('error')
                  setMapsErrorMsg('Busca cancelada pelo usuário.')
                }}
              >
                ⏸ Cancelar
              </button>
            )}

            {mapsLeads.length > 0 && mapsState !== 'scraping' && (
              <button
                onClick={handleMapsClear}
                style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 7,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans',
                }}
              >
                🗑 Limpar
              </button>
            )}
          </div>
        )}

        {/* Apollo CSV — upload e controles */}
        {mode === 'csv' && (
          <div>
            <div style={{ fontSize: 12, color: '#f97316', marginBottom: 14, fontWeight: 600 }}>
              📄 Upload do CSV exportado do Apollo.io — a extensão irá raspar LinkedIn + site de cada empresa.
            </div>

            <label className="section-label">Arquivo CSV do Apollo.io *</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvFileChange}
              style={{
                display: 'block', marginTop: 8, fontSize: 13,
                color: 'var(--text-secondary)', fontFamily: 'DM Sans, sans-serif',
                width: '100%',
              }}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              No Apollo.io: Pesquisa de empresas → selecione todas → Export → CSV. O agente usará as colunas
              <em> Company Name, Company LinkedIn Url, Website, Industry, # Employees, City, State, Phone.</em>
            </p>

            {csvParsed.length > 0 && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.25)',
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#f97316', margin: '0 0 6px' }}>
                  ✓ {csvParsed.length} empresa{csvParsed.length !== 1 ? 's' : ''} detectada{csvParsed.length !== 1 ? 's' : ''}
                </p>
                <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                  {csvParsed.slice(0, 30).map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: 'var(--cream)', fontWeight: 600, minWidth: 20 }}>{i + 1}.</span>
                      <span>{c.nome}</span>
                      {c.setor && <span style={{ color: 'var(--text-muted)' }}>· {c.setor}</span>}
                      {c.cidade && <span style={{ color: 'var(--text-muted)' }}>· {c.cidade}</span>}
                      {c.linkedin_url && <span style={{ color: '#f97316', fontSize: 10 }}>LI</span>}
                      {c.website     && <span style={{ color: '#f97316', fontSize: 10 }}>WEB</span>}
                    </div>
                  ))}
                  {csvParsed.length > 30 && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                      + {csvParsed.length - 30} mais…
                    </p>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {(csvState === 'idle' || csvState === 'done' || csvState === 'error') && (
                <button
                  onClick={handleCsvStart}
                  disabled={!canCsvStart}
                  style={{
                    padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    background: canCsvStart ? '#f97316' : 'var(--border)',
                    color: canCsvStart ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: canCsvStart ? 'pointer' : 'not-allowed',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {csvState === 'idle' ? '📄 Processar CSV' : '📄 Novo CSV'}
                </button>
              )}

              {csvState === 'scraping' && (
                <button className="btn-secondary" onClick={handleCsvPause}>⏸ Pausar</button>
              )}

              {csvState === 'paused' && (
                <>
                  <button
                    onClick={handleCsvResume}
                    style={{
                      padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: '#f97316', color: '#fff', border: 'none', cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    ▶ Retomar
                  </button>
                  <span style={{ fontSize: 12, color: '#f59e0b' }}>⏸ Processamento pausado</span>
                </>
              )}

              {!canCsvStart && csvParsed.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {extStatus !== 'connected' ? '⚠ Extensão não conectada' : 'Faça upload de um CSV para começar'}
                </span>
              )}

              {csvLeads.length > 0 && csvState !== 'scraping' && (
                <button
                  onClick={handleCsvClear}
                  style={{
                    marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
                    color: 'var(--text-muted)', padding: '6px 12px', borderRadius: 7,
                    fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans',
                  }}
                >
                  🗑 Limpar
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODO LINKEDIN ─────────────────────────────────────────── */}
      {mode === 'linkedin' && (
        <>
          {/* Barra de progresso */}
          {progress.total > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>
                  {agentState === 'scraping' && (
                    <><span className="spinner" style={{ display: 'inline-block', width: 11, height: 11, marginRight: 6 }} />Processando…</>
                  )}
                  {agentState === 'paused' && '⏸ Pausado'}
                  {agentState === 'done'   && '✓ Concluído'}
                </span>
                <span style={{ fontWeight: 600 }}>{progress.done} / {progress.total}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: agentState === 'paused' ? '#f59e0b' : 'var(--green-primary)',
                  width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )}

          {agentState === 'error' && errorMsg && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.07)', padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>⚠ {errorMsg}</p>
            </div>
          )}

          {leads.length > 0 && (
            <div>
              <p className="section-label" style={{ marginBottom: 12 }}>
                {leads.length} empresa{leads.length !== 1 ? 's' : ''} processada{leads.length !== 1 ? 's' : ''}
              </p>

              {leads.map((lead, idx) => (
                <div
                  key={`${lead.linkedin_url ?? lead.nome}-${idx}`}
                  className="card fade-in"
                  style={{ marginBottom: 10, cursor: 'pointer', padding: '14px 18px' }}
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 14 }}>{lead.nome}</span>
                        {lead.potencial && (
                          <span className="badge" style={{
                            background: potencialColor(lead.potencial) + '22',
                            color:      potencialColor(lead.potencial),
                            border:     `1px solid ${potencialColor(lead.potencial)}44`,
                            fontSize: 11,
                          }}>
                            {lead.potencial}
                          </span>
                        )}
                        {!lead.ok && (
                          <span className="badge" style={{
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.2)', fontSize: 11,
                          }}>sem LinkedIn</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}{lead.porte ? ` · ${lead.porte}` : ''}
                        {lead.employees_count ? ` · ${lead.employees_count}` : ''}
                        {lead.decision_makers?.length ? ` · ${lead.decision_makers.length} decisor${lead.decision_makers.length !== 1 ? 'es' : ''}` : ''}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                      {expandedIdx === idx ? '▲' : '▼'}
                    </span>
                  </div>

                  {expandedIdx === idx && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <p className="section-label" style={{ marginBottom: 8 }}>Contato</p>
                          {lead.email    && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>✉ {lead.email}</p>}
                          {lead.telefone && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>☎ {lead.telefone}</p>}
                          {lead.emails?.filter(e => e !== lead.email).map(e => (
                            <p key={e} style={{ fontSize: 12, color: '#4fa3e0', margin: '4px 0' }}>✉ {e}</p>
                          ))}
                          {lead.linkedin_url && (
                            <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>LinkedIn ↗</a>
                          )}
                          {!lead.email && !lead.telefone && !(lead.emails?.length) && !lead.linkedin_url && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem dados de contato</p>
                          )}
                        </div>
                        <div>
                          {lead.justificativa && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6 }}>Análise IA</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{lead.justificativa}</p>
                            </>
                          )}
                          {lead.argumento_abertura && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6, marginTop: 12 }}>Argumento de abertura</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>&ldquo;{lead.argumento_abertura}&rdquo;</p>
                            </>
                          )}
                        </div>
                        {(lead.decision_makers?.length ?? 0) > 0 && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <p className="section-label" style={{ marginBottom: 8 }}>Decisores</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {lead.decision_makers.map((dm, i) => (
                                <div key={i} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{dm.name}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>{dm.role}</span>
                                  {dm.profile_url && <a href={dm.profile_url} target="_blank" rel="noreferrer" style={{ color: '#4fa3e0', marginLeft: 'auto' }}>LinkedIn ↗</a>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(lead.dores_tipicas?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Dores típicas</p>
                            {lead.dores_tipicas.map((d, i) => <p key={i} style={{ fontSize: 12, color: '#ef4444', margin: '3px 0' }}>! {d}</p>)}
                          </div>
                        )}
                        {(lead.servicos_sugeridos?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Serviços sugeridos</p>
                            {lead.servicos_sugeridos.map((s, i) => <p key={i} style={{ fontSize: 12, color: 'var(--green-primary)', margin: '3px 0' }}>✓ {s}</p>)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {leads.length === 0 && (agentState === 'idle' || agentState === 'done') && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>🤖</p>
              <p style={{ fontSize: 14 }}>
                {agentState === 'idle'
                  ? 'Configure os filtros e inicie o agente para descobrir leads automaticamente.'
                  : 'Nenhum lead retornado. Tente ajustar os filtros.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── MODO APOLLO ───────────────────────────────────────────── */}
      {mode === 'apollo' && (
        <>
          {apolloProgress.total > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>
                  {apolloState === 'scraping' && (
                    <><span className="spinner" style={{ display: 'inline-block', width: 11, height: 11, marginRight: 6 }} />Buscando no Apollo…</>
                  )}
                  {apolloState === 'paused' && '⏸ Pausado'}
                  {apolloState === 'done'   && '✓ Concluído'}
                </span>
                <span style={{ fontWeight: 600 }}>{apolloProgress.done} / {apolloProgress.total}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: apolloState === 'paused' ? '#f59e0b' : '#6366f1',
                  width: `${Math.round((apolloProgress.done / apolloProgress.total) * 100)}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )}

          {apolloState === 'error' && apolloErrorMsg && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.07)', padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>⚠ {apolloErrorMsg}</p>
            </div>
          )}

          {apolloLeads.length > 0 && (
            <div>
              <p className="section-label" style={{ marginBottom: 12 }}>
                {apolloLeads.length} empresa{apolloLeads.length !== 1 ? 's' : ''} encontrada{apolloLeads.length !== 1 ? 's' : ''} via Apollo
              </p>

              {apolloLeads.map((lead, idx) => (
                <div
                  key={`${lead.apollo_url ?? lead.nome}-${idx}`}
                  className="card fade-in"
                  style={{ marginBottom: 10, cursor: 'pointer', padding: '14px 18px' }}
                  onClick={() => setApolloExpandedIdx(apolloExpandedIdx === idx ? null : idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 14 }}>{lead.nome}</span>
                        {lead.potencial && (
                          <span className="badge" style={{
                            background: potencialColor(lead.potencial) + '22',
                            color:      potencialColor(lead.potencial),
                            border:     `1px solid ${potencialColor(lead.potencial)}44`,
                            fontSize: 11,
                          }}>
                            {lead.potencial}
                          </span>
                        )}
                        {lead.score_fit != null && (
                          <span className="badge" style={{
                            background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                            border: '1px solid rgba(99,102,241,0.3)', fontSize: 11,
                          }}>
                            Fit {lead.score_fit}/10
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}{lead.porte ? ` · ${lead.porte}` : ''}
                        {lead.funcionarios ? ` · ${lead.funcionarios} func.` : ''}
                        {lead.website ? ` · ${lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                      {apolloExpandedIdx === idx ? '▲' : '▼'}
                    </span>
                  </div>

                  {apolloExpandedIdx === idx && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <p className="section-label" style={{ marginBottom: 8 }}>Contato</p>
                          {lead.email    && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>✉ {lead.email}</p>}
                          {lead.telefone && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>☎ {lead.telefone}</p>}
                          {lead.emails?.filter(e => e !== lead.email).map(e => (
                            <p key={e} style={{ fontSize: 12, color: '#4fa3e0', margin: '4px 0' }}>✉ {e}</p>
                          ))}
                          {lead.website && (
                            <a href={lead.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>Site ↗</a>
                          )}
                          {lead.linkedin_url && (
                            <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>LinkedIn ↗</a>
                          )}
                          {lead.apollo_url && (
                            <a href={lead.apollo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#818cf8', display: 'block', marginTop: 4 }}>Apollo ↗</a>
                          )}
                          {!lead.email && !lead.telefone && !(lead.emails?.length) && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem dados de contato</p>
                          )}
                        </div>
                        <div>
                          {lead.justificativa && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6 }}>Análise IA</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{lead.justificativa}</p>
                            </>
                          )}
                          {lead.argumento_abertura && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6, marginTop: 12 }}>Argumento de abertura</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>&ldquo;{lead.argumento_abertura}&rdquo;</p>
                            </>
                          )}
                        </div>
                        {(lead.dores_tipicas?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Dores típicas</p>
                            {lead.dores_tipicas.map((d, i) => <p key={i} style={{ fontSize: 12, color: '#ef4444', margin: '3px 0' }}>! {d}</p>)}
                          </div>
                        )}
                        {(lead.servicos_sugeridos?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Serviços sugeridos</p>
                            {lead.servicos_sugeridos.map((s, i) => <p key={i} style={{ fontSize: 12, color: 'var(--green-primary)', margin: '3px 0' }}>✓ {s}</p>)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {apolloLeads.length === 0 && (apolloState === 'idle' || apolloState === 'done' || apolloState === 'error') && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>🚀</p>
              <p style={{ fontSize: 14 }}>
                {apolloState === 'idle'
                  ? 'Selecione o setor e inicie o agente Apollo para descobrir leads via Apollo.io.'
                  : apolloState === 'error'
                  ? 'Nenhuma empresa extraída. Verifique se está logado no Apollo.io e tente novamente.'
                  : 'Nenhum lead retornado. Certifique-se de estar logado no Apollo.io.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── MODO GOOGLE MAPS ─────────────────────────────────────── */}
      {mode === 'maps' && (
        <>
          {mapsProgress.total > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>
                  {mapsState === 'scraping' && (
                    <><span className="spinner" style={{ display: 'inline-block', width: 11, height: 11, marginRight: 6 }} />Buscando no Google Maps…</>
                  )}
                  {mapsState === 'done'  && '✓ Concluído'}
                  {mapsState === 'error' && '⚠ Finalizado'}
                </span>
                <span style={{ fontWeight: 600 }}>{mapsProgress.done} / {mapsProgress.total}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: '#14b8a6',
                  width: `${mapsProgress.total > 0 ? Math.round((mapsProgress.done / mapsProgress.total) * 100) : 0}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )}

          {mapsState === 'error' && mapsErrorMsg && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.07)', padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>⚠ {mapsErrorMsg}</p>
            </div>
          )}

          {mapsLeads.length > 0 && (
            <div>
              <p className="section-label" style={{ marginBottom: 12 }}>
                {mapsLeads.length} empresa{mapsLeads.length !== 1 ? 's' : ''} encontrada{mapsLeads.length !== 1 ? 's' : ''} via Google Maps
              </p>

              {mapsLeads.map((lead, idx) => (
                <div
                  key={`${lead.nome}-${lead.cidade}-${idx}`}
                  className="card fade-in"
                  style={{ marginBottom: 10, cursor: 'pointer', padding: '14px 18px' }}
                  onClick={() => setMapsExpandedIdx(mapsExpandedIdx === idx ? null : idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 14 }}>{lead.nome}</span>
                        {lead.potencial && (
                          <span className="badge" style={{
                            background: potencialColor(lead.potencial) + '22',
                            color:      potencialColor(lead.potencial),
                            border:     `1px solid ${potencialColor(lead.potencial)}44`,
                            fontSize: 11,
                          }}>
                            {lead.potencial}
                          </span>
                        )}
                        {lead.melhor_canal && (
                          <span className="badge" style={{
                            background: 'rgba(20,184,166,0.12)', color: '#14b8a6',
                            border: '1px solid rgba(20,184,166,0.3)', fontSize: 11,
                          }}>
                            {lead.melhor_canal === 'ligacao' ? '📞' : lead.melhor_canal === 'whatsapp' ? '💬' : '📞💬'} {lead.melhor_canal}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}{lead.telefone_br ? ` · ${lead.telefone_br}` : ''}
                        {lead.site ? ` · ${lead.site.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                      {mapsExpandedIdx === idx ? '▲' : '▼'}
                    </span>
                  </div>

                  {mapsExpandedIdx === idx && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <p className="section-label" style={{ marginBottom: 8 }}>Contato</p>
                          {lead.telefone_br && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>📞 {lead.telefone_br}</p>}
                          {lead.telefone_intl && (
                            <a
                              href={`https://wa.me/${lead.telefone_intl}`}
                              target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: '#25d366', display: 'block', margin: '4px 0' }}
                            >
                              💬 WhatsApp ↗
                            </a>
                          )}
                          {lead.site && (
                            <a href={lead.site} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>Site ↗</a>
                          )}
                          {!lead.telefone_br && !lead.site && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem dados de contato</p>
                          )}
                          {lead.endereco && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>📍 {lead.endereco}</p>
                          )}
                          {lead.horario && (
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>🕒 {lead.horario.split(' | ')[0]}</p>
                          )}
                        </div>
                        <div>
                          {lead.justificativa && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6 }}>Análise IA</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{lead.justificativa}</p>
                            </>
                          )}
                          {lead.argumento_abertura && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6, marginTop: 12 }}>Argumento de abertura</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>&ldquo;{lead.argumento_abertura}&rdquo;</p>
                            </>
                          )}
                          {lead.melhor_horario && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                              Melhor horário: <strong style={{ color: 'var(--text-secondary)' }}>{lead.melhor_horario}</strong>
                            </p>
                          )}
                        </div>
                        {(lead.dores_tipicas?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Dores típicas</p>
                            {lead.dores_tipicas.map((d, i) => <p key={i} style={{ fontSize: 12, color: '#ef4444', margin: '3px 0' }}>! {d}</p>)}
                          </div>
                        )}
                        {(lead.servicos_sugeridos?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Serviços sugeridos</p>
                            {lead.servicos_sugeridos.map((s, i) => <p key={i} style={{ fontSize: 12, color: '#14b8a6', margin: '3px 0' }}>✓ {s}</p>)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {mapsLeads.length === 0 && (mapsState === 'idle' || mapsState === 'done' || mapsState === 'error') && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>🗺️</p>
              <p style={{ fontSize: 14 }}>
                {mapsState === 'idle'
                  ? 'Selecione o setor e as cidades para descobrir leads via Google Maps.'
                  : 'Nenhum lead retornado. Verifique a API key e os filtros selecionados.'}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── MODO CSV ──────────────────────────────────────────────── */}
      {mode === 'csv' && (
        <>
          {csvProgress.total > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>
                  {csvState === 'scraping' && (
                    <><span className="spinner" style={{ display: 'inline-block', width: 11, height: 11, marginRight: 6 }} />Raspando LinkedIn + sites…</>
                  )}
                  {csvState === 'paused' && '⏸ Pausado'}
                  {csvState === 'done'   && '✓ Concluído'}
                  {csvState === 'error'  && '⚠ Finalizado com erros'}
                </span>
                <span style={{ fontWeight: 600 }}>{csvProgress.done} / {csvProgress.total}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: '#f97316',
                  width: `${csvProgress.total > 0 ? Math.round((csvProgress.done / csvProgress.total) * 100) : 0}%`,
                  transition: 'width 0.4s',
                }} />
              </div>
              {csvLeads.length < csvProgress.done && csvState === 'scraping' && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Análise IA em andamento… {csvLeads.length} de {csvProgress.done} analisados
                </p>
              )}
            </div>
          )}

          {csvState === 'error' && csvErrorMsg && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.07)', padding: '12px 16px' }}>
              <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>⚠ {csvErrorMsg}</p>
            </div>
          )}

          {csvLeads.length > 0 && (
            <div>
              <p className="section-label" style={{ marginBottom: 12 }}>
                {csvLeads.length} empresa{csvLeads.length !== 1 ? 's' : ''} analisada{csvLeads.length !== 1 ? 's' : ''} via Apollo CSV
              </p>

              {csvLeads.map((lead, idx) => (
                <div
                  key={`${lead.nome}-${idx}`}
                  className="card fade-in"
                  style={{ marginBottom: 10, cursor: 'pointer', padding: '14px 18px' }}
                  onClick={() => setCsvExpandedIdx(csvExpandedIdx === idx ? null : idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--cream)', fontSize: 14 }}>{lead.nome}</span>
                        {lead.potencial && (
                          <span className="badge" style={{
                            background: potencialColor(lead.potencial) + '22',
                            color:      potencialColor(lead.potencial),
                            border:     `1px solid ${potencialColor(lead.potencial)}44`,
                            fontSize: 11,
                          }}>
                            {lead.potencial}
                          </span>
                        )}
                        {lead.score_fit != null && (
                          <span className="badge" style={{
                            background: 'rgba(249,115,22,0.12)', color: '#f97316',
                            border: '1px solid rgba(249,115,22,0.3)', fontSize: 11,
                          }}>
                            Fit {lead.score_fit}/10
                          </span>
                        )}
                        {!lead.ok && (
                          <span className="badge" style={{
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            border: '1px solid rgba(239,68,68,0.2)', fontSize: 11,
                          }}>sem análise IA</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                        {lead.setor}{lead.cidade ? ` · ${lead.cidade}` : ''}
                        {lead.funcionarios ? ` · ${lead.funcionarios} func.` : ''}
                        {lead.website ? ` · ${lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
                      {csvExpandedIdx === idx ? '▲' : '▼'}
                    </span>
                  </div>

                  {csvExpandedIdx === idx && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <p className="section-label" style={{ marginBottom: 8 }}>Contato</p>
                          {lead.email    && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>✉ {lead.email}</p>}
                          {lead.telefone && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>☎ {lead.telefone}</p>}
                          {lead.website && (
                            <a href={lead.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>Site ↗</a>
                          )}
                          {lead.linkedin_url && (
                            <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4fa3e0', display: 'block', marginTop: 4 }}>LinkedIn ↗</a>
                          )}
                          {!lead.email && !lead.telefone && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem dados de contato</p>
                          )}
                          {lead.melhor_canal && (
                            <p style={{ fontSize: 12, color: '#f97316', marginTop: 8, fontWeight: 600 }}>
                              Canal ideal: {lead.melhor_canal === 'ligacao' ? '📞 ligação' : lead.melhor_canal === 'whatsapp' ? '💬 WhatsApp' : '📞💬 ambos'}
                            </p>
                          )}
                        </div>
                        <div>
                          {lead.justificativa && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6 }}>Análise IA</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{lead.justificativa}</p>
                            </>
                          )}
                          {lead.argumento_abertura && (
                            <>
                              <p className="section-label" style={{ marginBottom: 6, marginTop: 12 }}>Argumento de abertura</p>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>&ldquo;{lead.argumento_abertura}&rdquo;</p>
                            </>
                          )}
                        </div>
                        {(lead.dores_tipicas?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Dores típicas</p>
                            {lead.dores_tipicas.map((d, i) => <p key={i} style={{ fontSize: 12, color: '#ef4444', margin: '3px 0' }}>! {d}</p>)}
                          </div>
                        )}
                        {(lead.servicos_sugeridos?.length ?? 0) > 0 && (
                          <div>
                            <p className="section-label" style={{ marginBottom: 8 }}>Serviços sugeridos</p>
                            {lead.servicos_sugeridos.map((s, i) => <p key={i} style={{ fontSize: 12, color: '#f97316', margin: '3px 0' }}>✓ {s}</p>)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {csvLeads.length === 0 && (csvState === 'idle' || csvState === 'done' || csvState === 'error') && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>📄</p>
              <p style={{ fontSize: 14 }}>
                {csvState === 'idle'
                  ? 'Faça upload do CSV exportado do Apollo.io e processe as empresas automaticamente.'
                  : 'Nenhuma empresa processada ainda.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
