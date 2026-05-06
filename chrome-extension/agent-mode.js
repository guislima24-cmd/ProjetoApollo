// agent-mode.js — Agente autônomo de descoberta de leads via LinkedIn
// STANDALONE: não importa nada do background.js existente.
// Prefixo "agent_" em todas as chaves de storage para não colidir com o sistema existente.

const AGENT_VERSION = 2
const MAX_COMPANIES = 25
const MIN_DELAY_MS  = 4000
const MAX_DELAY_MS  = 8000

const DECISION_MAKER_TITLES = [
  'gerente', 'diretor', 'coordenador', 'manager', 'head',
  'ceo', 'cto', 'cfo', 'coo', 'fundador', 'sócio', 'socio',
  'vp ', 'vice-presidente', 'presidente', 'superintendente',
]

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

// ── Helpers de tab ───────────────────────────────────────────────────────────

async function waitForTabComplete(tabId, timeoutMs = 25000) {
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

async function openTab(url) {
  const tab = await chrome.tabs.create({ url, active: false })
  const loaded = await waitForTabComplete(tab.id)
  if (!loaded) throw new Error('Timeout ao carregar: ' + url)
  // Dá tempo extra para o React/SPA renderizar o conteúdo
  await new Promise(r => setTimeout(r, 4000))
  return tab.id
}

async function closeTab(tabId) {
  if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {})
}

async function checkLinkedInBlock(tabId) {
  const [res] = await chrome.scripting.executeScript({
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
  return res?.result ?? { blocked: false }
}

// ── Extração dos resultados de busca de empresas ─────────────────────────────

async function extractSearchResults(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const results = []
      const seenUrls = new Set()

      function addResult(name, url, industry, location, description, followers) {
        if (!name || name.length < 2 || name.length > 120) return
        const cleanUrl = url ? url.split('?')[0].replace(/\/$/, '') : null
        if (cleanUrl && seenUrls.has(cleanUrl)) return
        if (cleanUrl) seenUrls.add(cleanUrl)
        results.push({ name, url: cleanUrl, industry, location, description, followers })
      }

      // Estratégia 1: seletores clássicos de containers
      const CONTAINER_SEL = [
        'li.reusable-search__result-container',
        '[data-view-name="search-entity-result-universal-template"]',
        '.search-results-container li',
        '.reusable-search-simple-insight',
      ].join(', ')
      const containers = document.querySelectorAll(CONTAINER_SEL)
      for (const c of containers) {
        const link = c.querySelector('a[href*="/company/"]')
        if (!link) continue
        const name = c.querySelector('span[aria-hidden="true"]')?.textContent?.trim()
                  || link.textContent?.trim()?.replace(/\s+/g, ' ')
        addResult(
          name,
          link.href,
          c.querySelector('.entity-result__primary-subtitle, [class*="primary-subtitle"]')?.textContent?.trim() ?? null,
          c.querySelector('.entity-result__secondary-subtitle, [class*="secondary-subtitle"]')?.textContent?.trim() ?? null,
          c.querySelector('.entity-result__summary, [class*="summary"]')?.textContent?.trim() ?? null,
          c.querySelector('.entity-result__insights, [class*="insight"]')?.textContent?.trim() ?? null,
        )
      }

      // Estratégia 2: fallback — qualquer link /company/ na página
      if (results.length === 0) {
        const allLinks = Array.from(document.querySelectorAll('a[href*="/company/"]'))
        for (const link of allLinks) {
          const href = link.href || ''
          if (!href.includes('/company/')) continue
          // Ignora links de navegação como /company/add, /company/setup
          if (/\/(add|setup|admin|create)/.test(href)) continue
          const name = link.querySelector('span[aria-hidden="true"]')?.textContent?.trim()
                    || link.getAttribute('aria-label')
                    || link.textContent?.trim()?.replace(/\s+/g, ' ')
          addResult(name, href, null, null, null, null)
        }
      }

      return results
    },
  })
  return (res?.result ?? []).filter(r => r.name && r.url)
}

// ── Extração de detalhes da página da empresa ────────────────────────────────

async function extractCompanyPageDetails(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const aboutEl = document.querySelector(
        '.org-about-us-organization-description__text, .org-about-module__description, section.artdeco-card p.break-words'
      )
      const description = aboutEl?.textContent?.trim() ?? null

      const sizeEl = document.querySelector(
        'a[href*="/employees/"] span, .org-about-company-module__company-size'
      )
      const employeesCount = sizeEl?.textContent?.trim() ?? null

      const postEls = document.querySelectorAll(
        '.feed-shared-update-v2__description, .update-components-text, .org-content-update__body'
      )
      const recentPosts = Array.from(postEls)
        .slice(0, 3)
        .map(el => el.textContent?.trim()?.slice(0, 200))
        .filter(Boolean)

      return { description, employeesCount, recentPosts }
    },
  })
  return res?.result ?? {}
}

// ── Extração de decisores da aba /people/ ───────────────────────────────────

async function extractDecisionMakers(tabId, titles) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (decisionTitles) => {
      const selectors = [
        '.org-people-profiles-module__profile-list li',
        '.artdeco-entity-lockup',
        '.member-analytics-profile-photo + div',
      ]
      let cards = []
      for (const sel of selectors) {
        cards = Array.from(document.querySelectorAll(sel))
        if (cards.length > 0) break
      }

      const people = []
      for (const card of cards) {
        if (people.length >= 5) break

        const nameEl = card.querySelector(
          '.org-people-profile-card__profile-title, .artdeco-entity-lockup__title'
        )
        const name = nameEl?.textContent?.trim() ?? null
        if (!name || name.length < 2) continue

        const roleEl = card.querySelector(
          '.org-people-profile-card__profile-position, .artdeco-entity-lockup__subtitle'
        )
        const role = roleEl?.textContent?.trim() ?? ''

        const linkEl = card.querySelector('a[href*="/in/"]')
        const profileUrl = linkEl?.href?.split('?')[0] ?? null

        const roleLower = role.toLowerCase()
        const isDecisionMaker = decisionTitles.some(t => roleLower.includes(t))
        if (!isDecisionMaker) continue

        people.push({ name, role, profile_url: profileUrl })
      }
      return people
    },
    args: [titles],
  })
  return res?.result ?? []
}

// ── Processa uma empresa do LinkedIn (detalhe + decisores) ──────────────────

async function processLinkedInCompany(entry, setor) {
  if (!entry.url) {
    return {
      company_name:    entry.name,
      linkedin_url:    null,
      sector:          entry.industry ?? setor,
      employees_count: entry.followers ?? null,
      location:        entry.location ?? '',
      description:     entry.description ?? null,
      recent_posts:    [],
      decision_makers: [],
      error:           'no_url',
    }
  }

  let detailTabId = null
  let peopleTabId = null

  try {
    // Abre a página da empresa
    detailTabId = await openTab(entry.url)

    const blockCheck = await checkLinkedInBlock(detailTabId)
    if (blockCheck.blocked) {
      return { error: blockCheck.reason, company_name: entry.name }
    }

    const details = await extractCompanyPageDetails(detailTabId)
    await closeTab(detailTabId)
    detailTabId = null

    // Extrai o slug da URL para montar /people/
    const slug = entry.url.replace(/\/$/, '').split('/company/')[1] ?? ''
    const peopleUrl = `https://www.linkedin.com/company/${slug}/people/`

    let decisionMakers = []
    try {
      peopleTabId = await openTab(peopleUrl)
      const peopleBlock = await checkLinkedInBlock(peopleTabId)
      if (!peopleBlock.blocked) {
        decisionMakers = await extractDecisionMakers(peopleTabId, DECISION_MAKER_TITLES)
      }
    } catch {
      // página /people/ pode falhar — não é fatal
    } finally {
      if (peopleTabId !== null) { await closeTab(peopleTabId); peopleTabId = null }
    }

    return {
      company_name:    entry.name,
      linkedin_url:    entry.url,
      sector:          entry.industry ?? setor,
      employees_count: entry.followers ?? details.employeesCount ?? null,
      location:        entry.location ?? '',
      description:     details.description ?? entry.description ?? null,
      recent_posts:    details.recentPosts ?? [],
      decision_makers: decisionMakers,
    }
  } catch (err) {
    return { error: err.message, company_name: entry.name }
  } finally {
    if (detailTabId !== null) await closeTab(detailTabId)
    if (peopleTabId !== null) await closeTab(peopleTabId)
  }
}

// ── Mapeamento de cidades para LinkedIn geoUrn (parâmetro do filtro de localização) ──
// Estes IDs são os mesmos que o LinkedIn usa internamente quando você clica no filtro "Localização".
// São Paulo estado (102042721) cobre toda a Grande São Paulo, incluindo ABC Paulista.
const LINKEDIN_GEO_URN = {
  'são paulo':             '105490917',  // cidade de São Paulo
  'sao paulo':             '105490917',
  'são paulo capital':     '105490917',
  'guarulhos':             '100364837',
  'campinas':              '101896426',
  'barueri':               '100364837',  // São Paulo área
  'osasco':                '100364837',  // São Paulo área
  // ABC Paulista — usa geoUrn do estado de SP pois LinkedIn não tem IDs individuais para essas cidades
  'são bernardo do campo': '102042721',
  'sao bernardo do campo': '102042721',
  'são bernardo':          '102042721',
  'santo andré':           '102042721',
  'santo andre':           '102042721',
  'são caetano do sul':    '102042721',
  'sao caetano do sul':    '102042721',
  'são caetano':           '102042721',
  'diadema':               '102042721',
  'mauá':                  '102042721',
  'maua':                  '102042721',
  'ribeirão pires':        '102042721',
  'ribeirao pires':        '102042721',
  'rio grande da serra':   '102042721',
}

function getGeoUrn(regiao) {
  const key = regiao.toLowerCase().trim()
  return LINKEDIN_GEO_URN[key] ?? '106057199'  // fallback: Brasil inteiro
}

// ── Busca de empresas via filtros nativos do LinkedIn ────────────────────────

async function searchLinkedInCompanies(setor, regiao, maxResults) {
  const geoUrn  = getGeoUrn(regiao)
  const keyword = encodeURIComponent(setor)
  // geoUrn precisa ser passado como array JSON URL-encoded: ["ID"]
  const geo     = encodeURIComponent(`["${geoUrn}"]`)

  const companies = []
  let page = 1

  while (companies.length < maxResults && page <= 5) {
    // Usa os filtros nativos do LinkedIn: keyword = setor, geoUrn = localização
    // Igual a pesquisar no LinkedIn e clicar no filtro "Localização"
    const url = `https://www.linkedin.com/search/results/companies/?keywords=${keyword}&geoUrn=${geo}&origin=FACETED_SEARCH&page=${page}`
    let tabId = null

    try {
      tabId = await openTab(url)

      const blockCheck = await checkLinkedInBlock(tabId)
      if (blockCheck.blocked) {
        const err = new Error(blockCheck.reason)
        err.blocked = true
        err.reason  = blockCheck.reason
        throw err
      }

      const results = await extractSearchResults(tabId)
      if (!results.length) break

      for (const r of results) {
        if (companies.length >= maxResults) break
        if (!r.name) continue
        if (r.url && companies.some(c => c.url === r.url)) continue
        companies.push(r)
      }

      page++
    } finally {
      if (tabId !== null) await closeTab(tabId)
    }

    if (companies.length < maxResults && page <= 5) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  return companies
}

// ── Chama /api/agent/process para enriquecimento + IA + Sheets ──────────────

async function processWithApi(linkedinData, setor, portes) {
  try {
    const [token, apiBase] = await Promise.all([agentGetSessionToken(), agentGetApiBase()])
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['X-Session-Token'] = token

    const res = await fetch(`${apiBase}/api/agent/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        company_name:    linkedinData.company_name,
        linkedin_url:    linkedinData.linkedin_url,
        sector:          linkedinData.sector,
        employees_count: linkedinData.employees_count,
        location:        linkedinData.location,
        description:     linkedinData.description,
        recent_posts:    linkedinData.recent_posts    ?? [],
        decision_makers: linkedinData.decision_makers ?? [],
        setor_filtro:    setor,
        portes:          portes ?? [],
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
    const { searchParams, results } = await agentGet(['searchParams', 'results'])
    const { setor, regioes, limite, portes } = searchParams ?? {}
    const existingResults = Array.isArray(results) ? results : []

    if (!setor || !regioes?.length) {
      await agentSet({ state: 'error', errorMessage: 'Parâmetros de busca ausentes.' })
      return
    }

    const perRegiao = Math.ceil(limite / Math.max(regioes.length, 1))
    await agentSet({ state: 'running', progress: { done: 0, total: limite } })

    // Set global de URLs vistas — persiste entre regiões para evitar duplicatas
    const seenUrls  = new Set(existingResults.map(r => r.linkedin_url).filter(Boolean))
    const seenNames = new Set(existingResults.map(r => r.nome?.toLowerCase()).filter(Boolean))

    for (const regiao of regioes) {
      const { state } = await agentGet(['state'])
      if (state === 'idle' || state === 'paused') break
      if (existingResults.length >= limite) break

      // Fase 1: descoberta de empresas no LinkedIn
      // Pede mais do que o necessário para compensar duplicatas que serão filtradas
      const fetchTarget = Math.min(perRegiao * 2, 50)
      let searchResults
      try {
        searchResults = await searchLinkedInCompanies(setor, regiao, fetchTarget)
      } catch (err) {
        if (err?.blocked) {
          await agentSet({ state: 'paused', pauseReason: err.reason })
          return
        }
        console.error('[agent-mode] Busca falhou para', regiao, ':', err)
        continue
      }

      // Fase 2: processar cada empresa descoberta (pulando duplicatas)
      for (const entry of searchResults) {
        const { state: cur } = await agentGet(['state'])
        if (cur === 'idle' || cur === 'paused') return
        if (existingResults.length >= limite) break

        // Deduplicação global por URL e por nome
        const entryUrl  = entry.url?.split('?')[0].replace(/\/$/, '') ?? null
        const entryName = entry.name?.toLowerCase() ?? null
        if (entryUrl  && seenUrls.has(entryUrl))   continue
        if (entryName && seenNames.has(entryName))  continue
        if (entryUrl)  seenUrls.add(entryUrl)
        if (entryName) seenNames.add(entryName)

        const linkedinData = await processLinkedInCompany(entry, setor)

        if (linkedinData?.error === 'login' || linkedinData?.error === 'captcha') {
          await agentSet({ state: 'paused', pauseReason: linkedinData.error })
          return
        }

        // Fase 3: enriquece com Brasil.io + IA + salva no Sheets
        const processed = await processWithApi(linkedinData, setor, portes ?? [])

        const result = {
          nome:               linkedinData.company_name,
          cnpj:               processed?.cnpj               ?? null,
          setor:              linkedinData.sector            ?? setor,
          porte:              processed?.porte               ?? null,
          cidade:             linkedinData.location          ?? regiao,
          email:              processed?.email               ?? null,
          telefone:           processed?.telefone            ?? null,
          linkedin_url:       linkedinData.linkedin_url      ?? null,
          employees_count:    linkedinData.employees_count   ?? null,
          decision_makers:    linkedinData.decision_makers   ?? [],
          potencial:          processed?.analysis?.potencial          ?? null,
          justificativa:      processed?.analysis?.justificativa      ?? null,
          dores_tipicas:      processed?.analysis?.dores_tipicas      ?? [],
          servicos_sugeridos: processed?.analysis?.servicos_sugeridos ?? [],
          argumento_abertura: processed?.analysis?.argumento_abertura ?? null,
          emails:             (processed?.emails ?? []).map(e => e.email),
          scrapedAt:          Date.now(),
          ok:                 !linkedinData.error,
        }

        existingResults.push(result)
        await agentSet({
          results:  existingResults,
          progress: { done: existingResults.length, total: limite },
        })

        if (existingResults.length < limite) {
          await new Promise(r => setTimeout(r, randomDelay()))
        }
      }
    }

    const { state: finalState } = await agentGet(['state'])
    if (finalState === 'running') await agentSet({ state: 'done' })
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
          // Recebe { searchParams: { setor, regioes, limite, portes } }
          const { setor, regioes, limite, portes } = message.searchParams ?? {}
          if (!setor || !regioes?.length) {
            sendResponse({ ok: false, error: 'searchParams.setor e searchParams.regioes são obrigatórios' })
            break
          }
          const limiteClamped = Math.min(Number(limite ?? 10), MAX_COMPANIES)
          await agentSet({
            searchParams: { setor, regioes, limite: limiteClamped, portes: portes ?? [] },
            results:      [],
            state:        'running',
            cursor:       0,
            progress:     { done: 0, total: limiteClamped },
            pauseReason:  null,
            errorMessage: null,
          })
          runAgentLoop()
          sendResponse({ ok: true, target: limiteClamped })
          break
        }

        case 'AGENT_GET_RESULTS': {
          const { results, state, progress, cursor, pauseReason, errorMessage } =
            await agentGet(['results', 'state', 'progress', 'cursor', 'pauseReason', 'errorMessage'])
          const allResults = Array.isArray(results) ? results : []
          const fromIndex  = cursor ?? 0
          const newItems   = allResults.slice(fromIndex)
          if (newItems.length) await agentSet({ cursor: allResults.length })
          sendResponse({
            ok:       true,
            results:  newItems,
            state:    state    ?? 'idle',
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

  return true
})
