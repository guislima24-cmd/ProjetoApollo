// agent-mode.js — Agente autônomo de descoberta de leads via LinkedIn
// STANDALONE: não importa nada do background.js existente.
// Prefixo "agent_" em todas as chaves de storage para não colidir com o sistema existente.

const AGENT_VERSION = 1
const MAX_COMPANIES = 20
const MIN_DELAY_MS  = 3000
const MAX_DELAY_MS  = 6000

function randomDelay() {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
}

// ── Helpers de API base / token (duplicados do background.js intencionalmente) ──

async function agentGetApiBase() {
  const { useProduction } = await chrome.storage.local.get('useProduction')
  return useProduction
    ? 'https://projeto-apollo.vercel.app'
    : 'http://localhost:3000'
}

async function agentGetSessionToken() {
  const { sessionToken } = await chrome.storage.local.get('sessionToken')
  return sessionToken ?? null
}

// ── Storage helpers (prefixo agent_) ────────────────────────────────────────

async function agentGet(keys) {
  const prefixed = {}
  for (const k of keys) prefixed[`agent_${k}`] = undefined
  const result = await chrome.storage.local.get(Object.keys(prefixed))
  const out = {}
  for (const k of keys) out[k] = result[`agent_${k}`] ?? null
  return out
}

async function agentSet(obj) {
  const prefixed = {}
  for (const [k, v] of Object.entries(obj)) prefixed[`agent_${k}`] = v
  await chrome.storage.local.set(prefixed)
}

async function agentClear() {
  const all = await chrome.storage.local.get(null)
  const agentKeys = Object.keys(all).filter(k => k.startsWith('agent_'))
  if (agentKeys.length) await chrome.storage.local.remove(agentKeys)
}

// ── Scraping do LinkedIn ─────────────────────────────────────────────────────

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab.status === 'complete') return true
    } catch {
      return false
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

async function scrapeLinkedInCompany(companyName, cidade) {
  const query = encodeURIComponent(`${companyName} ${cidade ?? ''}`.trim())
  const searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${query}`

  let tabId = null
  try {
    const tab = await chrome.tabs.create({ url: searchUrl, active: false })
    tabId = tab.id

    const loaded = await waitForTabComplete(tabId)
    if (!loaded) return { error: 'timeout', companyName }

    // Aguarda JS renderizar
    await new Promise(r => setTimeout(r, 2000))

    // Verifica bloqueio (login / captcha / authwall)
    const [checkResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const url = window.location.href
        if (url.includes('/login') || url.includes('/checkpoint') || url.includes('/authwall')) {
          return { blocked: true, reason: 'login' }
        }
        if (
          document.querySelector('.captcha-internal') ||
          document.querySelector('#captcha-challenge') ||
          document.title.toLowerCase().includes('security verification')
        ) {
          return { blocked: true, reason: 'captcha' }
        }
        return { blocked: false }
      },
    })

    if (checkResult?.result?.blocked) {
      return { error: checkResult.result.reason, companyName }
    }

    // Extrai o primeiro resultado da busca de empresas
    const [scrapeResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const items = document.querySelectorAll(
          '.entity-result__item, [data-view-name="search-entity-result-universal-template"]'
        )
        if (!items.length) return null

        const first = items[0]

        const nameEl = first.querySelector(
          '.entity-result__title-text a span[aria-hidden="true"], .entity-result__title-text'
        )
        const name = nameEl?.textContent?.trim() ?? null

        const urlEl = first.querySelector('.entity-result__title-text a')
        const url = urlEl?.href?.split('?')[0] ?? null

        const subtitleEl = first.querySelector('.entity-result__primary-subtitle')
        const industry = subtitleEl?.textContent?.trim() ?? null

        const secondaryEl = first.querySelector('.entity-result__secondary-subtitle')
        const location = secondaryEl?.textContent?.trim() ?? null

        const summaryEl = first.querySelector('.entity-result__summary')
        const summary = summaryEl?.textContent?.trim() ?? null

        const followersEl = first.querySelector('.entity-result__insights')
        const followers = followersEl?.textContent?.trim() ?? null

        return { name, url, industry, location, summary, followers }
      },
    })

    return {
      companyName,
      linkedin_url: scrapeResult?.result?.url      ?? null,
      industry:     scrapeResult?.result?.industry  ?? null,
      location:     scrapeResult?.result?.location  ?? null,
      summary:      scrapeResult?.result?.summary   ?? null,
      followers:    scrapeResult?.result?.followers ?? null,
    }
  } catch (err) {
    return { error: err.message, companyName }
  } finally {
    if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {})
  }
}

// ── Chama /api/agent/process para análise IA + email + Sheets ───────────────

async function processWithApi(company, scraped) {
  try {
    const [token, apiBase] = await Promise.all([agentGetSessionToken(), agentGetApiBase()])
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['X-Session-Token'] = token

    const res = await fetch(`${apiBase}/api/agent/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        nome:         company.nome,
        cnpj:         company.cnpj,
        setor:        company.setor,
        porte:        company.porte,
        cidade:       company.cidade,
        email:        company.email,
        telefone:     company.telefone,
        linkedin_url: scraped.linkedin_url ?? null,
        followers:    scraped.followers    ?? null,
        industry:     scraped.industry     ?? null,
      }),
    })

    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── Loop principal do agente ────────────────────────────────────────────────

let agentRunning = false

async function runAgentLoop() {
  if (agentRunning) return
  agentRunning = true

  try {
    const { queue, results } = await agentGet(['queue', 'results'])
    const companies      = queue ?? []
    const existingResults = Array.isArray(results) ? results : []

    await agentSet({ state: 'running', progress: { done: 0, total: companies.length } })

    for (let i = 0; i < companies.length; i++) {
      // Verifica se foi pausado ou cancelado
      const { state } = await agentGet(['state'])
      if (state === 'idle' || state === 'paused') break

      const company = companies[i]
      const scraped = await scrapeLinkedInCompany(company.nome, company.cidade)

      // Bloquio de login/captcha → para o agente
      if (scraped?.error === 'login' || scraped?.error === 'captcha') {
        await agentSet({ state: 'paused', pauseReason: scraped.error })
        break
      }

      // Análise IA + email + Sheets (via API)
      const processed = await processWithApi(company, scraped ?? {})

      const result = {
        ...company,
        linkedin_url:       scraped?.linkedin_url ?? null,
        industry:           scraped?.industry     ?? null,
        followers:          scraped?.followers    ?? null,
        potencial:          processed?.analysis?.potencial          ?? null,
        justificativa:      processed?.analysis?.justificativa      ?? null,
        dores_tipicas:      processed?.analysis?.dores_tipicas      ?? [],
        servicos_sugeridos: processed?.analysis?.servicos_sugeridos ?? [],
        argumento_abertura: processed?.analysis?.argumento_abertura ?? null,
        emails:             (processed?.emails ?? []).map(e => e.email),
        scrapedAt:          Date.now(),
        ok:                 !scraped?.error,
      }

      existingResults.push(result)
      await agentSet({
        results:  existingResults,
        progress: { done: i + 1, total: companies.length },
      })

      if (i < companies.length - 1) {
        await new Promise(r => setTimeout(r, randomDelay()))
      }
    }

    const { state: currentState } = await agentGet(['state'])
    if (currentState === 'running') {
      await agentSet({ state: 'done' })
    }
  } catch (err) {
    console.error('[agent-mode] Erro no loop:', err)
    await agentSet({ state: 'error', errorMessage: err.message })
  } finally {
    agentRunning = false
  }
}

// ── Listener de mensagens externas (page → extension) ───────────────────────

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith('AGENT_')) return false

  ;(async () => {
    try {
      switch (message.type) {
        case 'AGENT_PING':
          sendResponse({ ok: true, version: AGENT_VERSION })
          break

        case 'AGENT_SCRAPE_QUEUE': {
          const companies = (message.companies ?? []).slice(0, MAX_COMPANIES)
          await agentSet({
            queue:    companies,
            results:  [],
            state:    'running',
            cursor:   0,
            progress: { done: 0, total: companies.length },
            pauseReason:  null,
            errorMessage: null,
          })
          runAgentLoop()   // inicia sem bloquear
          sendResponse({ ok: true, queued: companies.length })
          break
        }

        case 'AGENT_GET_RESULTS': {
          const { results, state, progress, cursor, pauseReason, errorMessage } =
            await agentGet(['results', 'state', 'progress', 'cursor', 'pauseReason', 'errorMessage'])
          const allResults = Array.isArray(results) ? results : []
          const fromIndex  = cursor ?? 0
          const newItems   = allResults.slice(fromIndex)
          if (newItems.length) {
            await agentSet({ cursor: allResults.length })
          }
          sendResponse({
            ok:       true,
            results:  newItems,
            state:    state   ?? 'idle',
            progress: progress ?? { done: 0, total: 0 },
            pauseReason,
            errorMessage,
          })
          break
        }

        case 'AGENT_PAUSE':
          await agentSet({ state: 'paused' })
          sendResponse({ ok: true })
          break

        case 'AGENT_RESUME': {
          const { state } = await agentGet(['state'])
          if (state === 'paused') {
            await agentSet({ state: 'running', pauseReason: null })
            runAgentLoop()
          }
          sendResponse({ ok: true })
          break
        }

        case 'AGENT_CLEAR':
          await agentClear()
          agentRunning = false
          sendResponse({ ok: true })
          break

        default:
          sendResponse({ ok: false, error: 'Tipo de mensagem desconhecido' })
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message })
    }
  })()

  return true  // mantém canal aberto para sendResponse assíncrono
})
