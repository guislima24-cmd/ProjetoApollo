// agent-mode-apollo.js — Agente autônomo de descoberta de leads via Apollo.io
// STANDALONE: não importa nada do background.js existente.
// Prefixo "apollo_" em todas as chaves de storage para não colidir com agent_ ou sistema existente.

const APOLLO_VERSION   = 1
const APOLLO_MIN_DELAY = 3000
const APOLLO_MAX_DELAY = 7000

// ── Mapeamento Setor → keyword Apollo ────────────────────────────────────────

const APOLLO_SECTOR_MAP = {
  'ti':               'information technology',
  'tecnologia':       'information technology',
  'construção civil': 'construction',
  'construcao civil': 'construction',
  'construção':       'construction',
  'construcao':       'construction',
  'educação':         'education management',
  'educacao':         'education management',
  'saúde':            'hospital & health care',
  'saude':            'hospital & health care',
  'varejo':           'retail',
  'logística':        'logistics and supply chain',
  'logistica':        'logistics and supply chain',
  'indústria':        'industrial automation',
  'industria':        'industrial automation',
  'alimentação':      'food & beverages',
  'alimentacao':      'food & beverages',
  'consultoria':      'management consulting',
  'marketing':        'marketing and advertising',
  'financeiro':       'financial services',
  'imobiliário':      'real estate',
  'imobiliario':      'real estate',
  'jurídico':         'law practice',
  'juridico':         'law practice',
  'contabilidade':    'accounting',
}

// Porte → faixas de funcionários do Apollo (min,max)
const APOLLO_EMPLOYEE_RANGES = {
  'MEI':    '1,10',
  'ME':     '11,50',
  'EPP':    '51,200',
  'MEDIO':  '201,500',
  'GRANDE': '501,10000',
}

function randomDelay() {
  return APOLLO_MIN_DELAY + Math.random() * (APOLLO_MAX_DELAY - APOLLO_MIN_DELAY)
}

// ── API base / token (duplicados intencionalmente do background.js) ───────────

async function apolloGetApiBase() {
  const { useProduction } = await chrome.storage.local.get('useProduction')
  return useProduction
    ? 'https://projeto-apollo.vercel.app'
    : 'http://localhost:3000'
}

async function apolloGetSessionToken() {
  const { sessionToken } = await chrome.storage.local.get('sessionToken')
  return sessionToken ?? null
}

// ── Storage helpers (prefixo apollo_) ────────────────────────────────────────

async function apolloGet(keys) {
  const prefixed = {}
  for (const k of keys) prefixed[`apollo_${k}`] = undefined
  const result = await chrome.storage.local.get(Object.keys(prefixed))
  const out = {}
  for (const k of keys) out[k] = result[`apollo_${k}`] ?? null
  return out
}

async function apolloSet(obj) {
  const prefixed = {}
  for (const [k, v] of Object.entries(obj)) prefixed[`apollo_${k}`] = v
  await chrome.storage.local.set(prefixed)
}

async function apolloClear() {
  const all = await chrome.storage.local.get(null)
  const keys = Object.keys(all).filter(k => k.startsWith('apollo_'))
  if (keys.length) await chrome.storage.local.remove(keys)
}

// ── Tab helpers ───────────────────────────────────────────────────────────────

async function apolloWaitForTab(tabId, timeoutMs = 30000) {
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

async function apolloOpenTab(url, extraDelayMs = 4000) {
  const tab = await chrome.tabs.create({ url, active: false })
  await apolloWaitForTab(tab.id)
  await new Promise(r => setTimeout(r, extraDelayMs))
  return tab.id
}

async function apolloCloseTab(tabId) {
  try { await chrome.tabs.remove(tabId) } catch {}
}

// ── URL builder ───────────────────────────────────────────────────────────────

function buildApolloSearchUrl(setor, portes, page = 1) {
  const keyword = APOLLO_SECTOR_MAP[setor?.toLowerCase()] ?? setor ?? ''
  const parts   = []

  if (keyword) parts.push(`qOrganizationKeywordTags[]=${encodeURIComponent(keyword)}`)

  for (const porte of (portes ?? [])) {
    const range = APOLLO_EMPLOYEE_RANGES[porte]
    if (range) parts.push(`organizationNumEmployeesRanges[]=${encodeURIComponent(range)}`)
  }

  // Não inclui filtro de localização via URL — Apollo não reconhece o formato de ID externo.
  // A localização é aplicada via interação com o DOM depois que a página carrega.
  parts.push(`page=${page}`)

  return `https://app.apollo.io/#/companies?${parts.join('&')}`
}

// ── Aplica filtro de localização via DOM ─────────────────────────────────────

async function applyLocationFilter(tabId, localizacao) {
  if (!localizacao) return

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (location) => {
      // Simula digitação em input React sem perder o estado
      function typeReact(el, value) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        if (setter) setter.call(el, value)
        else el.value = value
        el.dispatchEvent(new Event('input',  { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }

      // Encontra e expande a seção "Localização da conta"
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
      const locBtn = allButtons.find(b => {
        const t = b.textContent?.trim() ?? ''
        return t.includes('Localiza') || t.includes('Location') || t.includes('Account Location')
      })
      if (locBtn) {
        locBtn.click()
        // Depois de expandir, tenta preencher o input que aparece
        setTimeout(() => {
          const inputs = document.querySelectorAll('input[type="text"], input[placeholder]')
          const locInput = Array.from(inputs).find(i =>
            (i.placeholder ?? '').toLowerCase().includes('localiza') ||
            (i.placeholder ?? '').toLowerCase().includes('location') ||
            (i.placeholder ?? '').toLowerCase().includes('search') ||
            (i.placeholder ?? '').toLowerCase().includes('pesquis')
          )
          if (locInput) typeReact(locInput, location)
        }, 800)
      }
    },
    args: [localizacao],
  })

  // Aguarda sugestões carregarem e clica na primeira
  await new Promise(r => setTimeout(r, 2000))

  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Clica na primeira sugestão de localização que aparecer
      const suggestions = document.querySelectorAll(
        '[class*="suggestion"], [class*="option"], [class*="dropdown"] li, [role="option"]'
      )
      if (suggestions.length > 0) suggestions[0].click()
    },
  })

  await new Promise(r => setTimeout(r, 1500))
}

// ── Extração de empresas do Apollo ────────────────────────────────────────────

async function extractApolloCompanies(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const companies = []
      const seen = new Set()

      // IDs de empresa no Apollo são strings alfanuméricas de 16–30 chars
      const COMPANY_ID_RE = /\/companies\/([a-z0-9]{10,30})(?:[/?#]|$)/i

      // Todos os links que apontam para /companies/{id}
      const allLinks = Array.from(document.querySelectorAll('a[href*="/companies/"]'))

      allLinks.forEach(link => {
        const href  = link.getAttribute('href') ?? ''
        const match = href.match(COMPANY_ID_RE)
        if (!match) return
        const id = match[1]
        if (seen.has(id)) return

        const name = link.innerText?.trim() ?? ''
        // Ignora links com texto vazio, muito curto, muito longo ou apenas dígitos
        if (name.length < 2 || name.length > 100) return
        if (/^[\d\s+]+$/.test(name)) return

        seen.add(id)

        // Tenta obter dados extras da linha/card pai
        const row = link.closest('tr')
          ?? link.closest('[class*="row"]')
          ?? link.closest('[class*="entity"]')
          ?? link.closest('[class*="company"]')
          ?? link.parentElement?.parentElement

        let website = '', employees = '', cidade = '', telefone = ''

        if (row) {
          const siteLink = row.querySelector(
            'a[href^="http"]:not([href*="apollo.io"]):not([href*="linkedin"]):not([href*="/companies/"])'
          )
          if (siteLink) website = siteLink.href ?? ''

          const cellText = Array.from(row.querySelectorAll('td, [class*="cell"], [class*="col"]'))
            .map(c => c.innerText?.trim() ?? '')
            .filter(t => t.length > 0)

          employees = cellText.find(t => /\d[\d,.]*\s*[-–]\s*[\d,.]+|\d[\d,.]+\+|employees/i.test(t)) ?? ''
          cidade    = cellText.find(t => t.length > 4 && /[,·•]|Brasil|Brazil|SP|RJ|MG|São|Rio|Bras/i.test(t)) ?? ''
          telefone  = cellText.find(t => /^\+?[\d\s\-().]{8,}$/.test(t)) ?? ''
        }

        companies.push({
          nome:         name,
          apollo_url:   `https://app.apollo.io${href}`,
          website,
          employees,
          setor:        '',
          cidade,
          telefone,
          linkedin_url: null,
        })
      })

      return companies
    },
  })

  return result?.[0]?.result ?? []
}

// ── Scraping da página da empresa no Apollo ───────────────────────────────────

async function scrapeApolloCompanyPage(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const getText = sel => document.querySelector(sel)?.innerText?.trim() ?? ''
      const getHref = sel => document.querySelector(sel)?.getAttribute('href') ?? ''

      const website     = getHref('a[href^="http"]:not([href*="apollo"]):not([href*="linkedin"])')
      const linkedinUrl = getHref('a[href*="linkedin.com/company"]')
      const telefone    = getText('[data-cy="phone"], [class*="phone"]')
      const cidade      = getText('[data-cy="location"], [class*="location"]')
      const employees   = getText('[data-cy="employees"], [class*="employees"], [class*="headcount"]')
      const setor       = getText('[data-cy="industry"], [class*="industry"]')

      return { website, linkedin_url: linkedinUrl || null, telefone: telefone || null, cidade: cidade || null, employees: employees || null, setor: setor || null }
    },
  })

  return result?.[0]?.result ?? {}
}

// ── Scraping de texto do website da empresa ───────────────────────────────────

async function scrapeWebsiteText(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Remove scripts, styles, nav
      document.querySelectorAll('script,style,nav,header,footer').forEach(el => el.remove())
      return (document.body?.innerText ?? '').slice(0, 3000)
    },
  })
  return result?.[0]?.result ?? ''
}

// ── Chamada à API de enriquecimento ───────────────────────────────────────────

async function callProcessApollo(company, setor, portes) {
  const [apiBase, token] = await Promise.all([apolloGetApiBase(), apolloGetSessionToken()])
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['X-Session-Token'] = token

  const body = {
    company_name:    company.nome,
    website:         company.website     || null,
    apollo_url:      company.apollo_url  || null,
    linkedin_url:    company.linkedin_url || null,
    sector:          company.setor       || setor || null,
    employees:       company.employees   || null,
    location:        company.cidade      || null,
    phone:           company.telefone    || null,
    website_text:    company.website_text || null,
    decision_makers: [],
    setor_filtro:    setor,
    portes,
  }

  try {
    const res = await fetch(`${apiBase}/api/agent/process-apollo`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── Verificação de autenticação no Apollo ─────────────────────────────────────

async function checkApolloAuth(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const isLogin = document.querySelector('[class*="login"], [class*="signin"], input[type="password"]')
      const hasContent = document.querySelector('[class*="company"], table tbody tr, a[href*="/companies/"]')
      return { isLogin: !!isLogin, hasContent: !!hasContent }
    },
  })
  return result?.[0]?.result ?? { isLogin: false, hasContent: false }
}

// ── Loop principal ────────────────────────────────────────────────────────────

async function runApolloLoop() {
  const { searchParams } = await apolloGet(['searchParams'])
  if (!searchParams) return

  const { setor, portes, limite, localizacao } = searchParams
  const target = Math.min(limite ?? 10, 20)

  const existingData = await apolloGet(['results'])
  const existingResults = existingData.results ?? []
  const seenUrls  = new Set(existingResults.map(r => r.apollo_url).filter(Boolean))
  const seenNames = new Set(existingResults.map(r => r.nome?.toLowerCase()).filter(Boolean))

  let collected  = existingResults.length
  let tabId      = null

  try {
    for (let page = 1; page <= 10 && collected < target; page++) {
      const { state } = await apolloGet(['state'])
      if (state === 'paused') return

      // Abre Apollo com filtros
      const apolloUrl = buildApolloSearchUrl(setor, portes ?? [], page)
      tabId = await apolloOpenTab(apolloUrl, 9000)

      // Verifica autenticação
      const auth = await checkApolloAuth(tabId)
      if (auth.isLogin) {
        await apolloCloseTab(tabId); tabId = null
        await apolloSet({ state: 'paused', pauseReason: 'login' })
        return
      }

      // Aplica filtro de localização via DOM (se informado)
      if (localizacao) {
        await applyLocationFilter(tabId, localizacao)
        await new Promise(r => setTimeout(r, 3500))
      }

      // Extrai lista de empresas da página
      const entries = await extractApolloCompanies(tabId)
      await apolloCloseTab(tabId); tabId = null

      if (!entries.length) break  // sem mais resultados

      for (const entry of entries) {
        if (collected >= target) break

        const { state: s } = await apolloGet(['state'])
        if (s === 'paused') return

        // Deduplicação
        const entryUrl  = entry.apollo_url?.trim()
        const entryName = entry.nome?.toLowerCase()
        if (entryUrl  && seenUrls.has(entryUrl))   continue
        if (entryName && seenNames.has(entryName))  continue
        if (entryUrl)  seenUrls.add(entryUrl)
        if (entryName) seenNames.add(entryName)

        // Opcional: abre página da empresa no Apollo para mais detalhes
        let companyDetails = {}
        if (entry.apollo_url) {
          try {
            const cTabId = await apolloOpenTab(entry.apollo_url, 3500)
            companyDetails = await scrapeApolloCompanyPage(cTabId)
            await apolloCloseTab(cTabId)
          } catch {}
        }

        // Opcional: scraping do website
        const website = companyDetails.website || entry.website || ''
        let websiteText = ''
        if (website && website.startsWith('http')) {
          try {
            const wTabId = await apolloOpenTab(website, 3000)
            websiteText = await scrapeWebsiteText(wTabId)
            await apolloCloseTab(wTabId)
          } catch {}
        }

        const merged = {
          ...entry,
          ...companyDetails,
          website:      website || entry.website,
          website_text: websiteText || null,
        }

        // Chama API de enriquecimento
        const processed = await callProcessApollo(merged, setor, portes ?? [])

        const lead = {
          nome:               merged.nome,
          setor:              merged.setor              || setor,
          porte:              processed?.porte          || null,
          cidade:             merged.cidade             || null,
          funcionarios:       merged.employees          || null,
          website:            merged.website            || null,
          apollo_url:         merged.apollo_url         || null,
          linkedin_url:       merged.linkedin_url       || null,
          email:              processed?.email          || null,
          telefone:           merged.telefone           || processed?.telefone || null,
          cnpj:               processed?.cnpj           || null,
          potencial:          processed?.analysis?.potencial          || null,
          justificativa:      processed?.analysis?.justificativa       || null,
          dores_tipicas:      processed?.analysis?.dores_tipicas       || [],
          servicos_sugeridos: processed?.analysis?.servicos_sugeridos  || [],
          argumento_abertura: processed?.analysis?.argumento_abertura  || null,
          score_fit:          processed?.analysis?.score_fit           || null,
          emails:             processed?.emails || [],
          decision_makers:    [],
          ok:                 !!processed?.ok,
        }

        const currentData = await apolloGet(['results'])
        const results = currentData.results ?? []
        results.push(lead)
        collected = results.length

        await apolloSet({
          results,
          progress: { done: collected, total: target },
        })

        await new Promise(r => setTimeout(r, randomDelay()))
      }
    }
  } finally {
    if (tabId) { try { await apolloCloseTab(tabId) } catch {} }
  }

  await apolloSet({ state: 'done', progress: { done: collected, total: target } })
}

// ── Listener de mensagens ─────────────────────────────────────────────────────

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type === 'APOLLO_PING') {
    sendResponse({ ok: true, version: APOLLO_VERSION })
    return false
  }

  if (message.type === 'APOLLO_SCRAPE_QUEUE') {
    console.log('[apollo] APOLLO_SCRAPE_QUEUE recebido', message.searchParams)
    ;(async () => {
      try {
        const { searchParams } = message
        if (!searchParams?.setor) {
          sendResponse({ ok: false, error: 'setor obrigatório' })
          return
        }

        await apolloClear()
        await apolloSet({
          state:        'scraping',
          searchParams,
          results:      [],
          progress:     { done: 0, total: searchParams.limite ?? 10 },
          pauseReason:  null,
          errorMessage: null,
        })

        console.log('[apollo] storage inicializado, enviando ok')
        sendResponse({ ok: true, target: searchParams.limite ?? 10 })

        runApolloLoop().catch(async err => {
          console.error('[apollo] loop error:', err)
          await apolloSet({ state: 'error', errorMessage: String(err?.message ?? err) })
        })
      } catch (err) {
        console.error('[apollo] APOLLO_SCRAPE_QUEUE erro:', err)
        sendResponse({ ok: false, error: String(err?.message ?? err) })
      }
    })()
    return true
  }

  if (message.type === 'APOLLO_GET_RESULTS') {
    ;(async () => {
      const data = await apolloGet(['state', 'results', 'progress', 'pauseReason', 'errorMessage'])
      if (!data.state) { sendResponse({ ok: false }); return }

      const newResults = data.results ?? []
      sendResponse({
        ok:           true,
        state:        data.state,
        results:      newResults,
        progress:     data.progress   ?? { done: 0, total: 0 },
        pauseReason:  data.pauseReason  ?? null,
        errorMessage: data.errorMessage ?? null,
      })

      // Limpa results do storage após entrega para não acumular
      await apolloSet({ results: [] })
    })()
    return true
  }

  if (message.type === 'APOLLO_PAUSE') {
    apolloSet({ state: 'paused', pauseReason: 'manual' })
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'APOLLO_RESUME') {
    ;(async () => {
      await apolloSet({ state: 'scraping', pauseReason: null })
      runApolloLoop().catch(async err => {
        await apolloSet({ state: 'error', errorMessage: String(err?.message ?? err) })
      })
      sendResponse({ ok: true })
    })()
    return true
  }

  if (message.type === 'APOLLO_CLEAR') {
    apolloClear()
    sendResponse({ ok: true })
    return false
  }

  return false
})
