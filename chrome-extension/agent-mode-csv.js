// agent-mode-csv.js — Processador de CSV exportado do Apollo.io
// STANDALONE: não importa nada do background.js existente.
// Prefixo "csv_" em todas as chaves de storage para não colidir com agent_ / apollo_.

const CSV_VERSION   = 1
const CSV_MIN_DELAY = 2000
const CSV_MAX_DELAY = 5000

function randomDelay() {
  return CSV_MIN_DELAY + Math.random() * (CSV_MAX_DELAY - CSV_MIN_DELAY)
}

// ── Storage helpers (prefixo csv_) ────────────────────────────────────────────

async function csvGet(keys) {
  const prefixed = {}
  for (const k of keys) prefixed[`csv_${k}`] = undefined
  const result = await chrome.storage.local.get(Object.keys(prefixed))
  const out = {}
  for (const k of keys) out[k] = result[`csv_${k}`] ?? null
  return out
}

async function csvSet(obj) {
  const prefixed = {}
  for (const [k, v] of Object.entries(obj)) prefixed[`csv_${k}`] = v
  await chrome.storage.local.set(prefixed)
}

async function csvClear() {
  const all = await chrome.storage.local.get(null)
  const keys = Object.keys(all).filter(k => k.startsWith('csv_'))
  if (keys.length) await chrome.storage.local.remove(keys)
}

// ── Tab helpers ───────────────────────────────────────────────────────────────

async function csvWaitForTab(tabId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab.status === 'complete') return true
    } catch { return false }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

async function csvOpenTab(url, delayMs = 2500) {
  const tab = await chrome.tabs.create({ url, active: false })
  await csvWaitForTab(tab.id)
  await new Promise(r => setTimeout(r, delayMs))
  return tab.id
}

async function csvCloseTab(tabId) {
  try { await chrome.tabs.remove(tabId) } catch {}
}

// ── LinkedIn company page — texto de about ───────────────────────────────────

async function scrapeLinkedInAbout(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (document.querySelector('input[name="session_key"]') || document.querySelector('.login__form')) return ''
        document.querySelectorAll('script,style,nav,header,footer,aside,iframe').forEach(el => el.remove())
        const sections = [
          '.org-about-us-organization-description__text',
          '.organization-about-us',
          '[data-test-id="about-us"]',
          '.org-grid__core-rail',
          'main',
        ]
        for (const sel of sections) {
          const el = document.querySelector(sel)
          if (el) return (el.innerText ?? '').slice(0, 2000)
        }
        return (document.body?.innerText ?? '').slice(0, 2000)
      },
    })
    return result?.[0]?.result ?? ''
  } catch {
    return ''
  }
}

// ── LinkedIn /people — decisores reais com perfil URL ────────────────────────

const DECISION_KEYWORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'diretor', 'diretora', 'director',
  'sócio', 'socia', 'socio', 'fundador', 'fundadora', 'founder',
  'presidente', 'president', 'gerente', 'manager', 'head of', 'head ',
  'vp ', 'vice-president', 'vice-presidente', 'superintendente',
  'partner', 'coordenador', 'coordenadora',
]

function isDecisionMaker(role) {
  const r = (role ?? '').toLowerCase()
  return DECISION_KEYWORDS.some(k => r.includes(k))
}

async function scrapeLinkedInPeople(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (decisionKeywords) => {
        if (document.querySelector('input[name="session_key"]') || document.querySelector('.login__form')) return []

        function isDM(role) {
          const r = (role ?? '').toLowerCase()
          return decisionKeywords.some(k => r.includes(k))
        }

        // Valida se o texto parece um nome real de pessoa (não página/empresa/post)
        function looksLikePersonName(text) {
          if (!text || text.length < 3 || text.length > 55) return false
          // Nome de pessoa: máximo ~4 palavras, sem URL, email, símbolo, número no início
          if (/https?:|www\.|@|\$|#|^\d/.test(text)) return false
          // Não é um título de empresa ou post (começa minúsculo, tem muitas palavras, etc.)
          const words = text.trim().split(/\s+/)
          if (words.length > 6) return false
          // Pelo menos a primeira palavra começa com maiúscula
          if (!/^[A-ZÁÉÍÓÚÀÃÕÂÊÔÜÇ]/.test(text)) return false
          return true
        }

        const seen = new Set()
        const employees = []

        // Estratégia: links /in/ que apontam para perfis de pessoas (não /in/ geral)
        document.querySelectorAll('a[href*="/in/"]').forEach(link => {
          const href = (link.href ?? '').split('?')[0]
          // Precisa ter /in/ seguido de pelo menos 3 chars (slug ou ID)
          const match = href.match(/\/in\/([^/?#]{3,})/)
          if (!match) return

          const profileUrl = href.endsWith('/') ? href : href + '/'
          if (seen.has(profileUrl)) return

          // Sobe na DOM para achar o card do funcionário
          const card = link.closest('li, [class*="profile-card"], [class*="lockup"], article')
            ?? link.closest('[class*="card"]')
            ?? link.parentElement

          if (!card) return

          // Nome: do elemento de título ou do texto do link
          const titleEl = card.querySelector('[class*="title"], [class*="lockup__title"]')
          let name = (titleEl?.innerText?.trim()?.split('\n')[0] ?? '').trim()
          if (!name) name = (link.innerText?.trim()?.split('\n')[0] ?? '').trim()

          // Valida nome antes de prosseguir
          if (!looksLikePersonName(name)) return

          // Cargo: subtítulo do card
          const subtitleEl = card.querySelector('[class*="subtitle"], [class*="position"], [class*="lockup__subtitle"]')
          const role = (subtitleEl?.innerText?.trim()?.split('\n')[0] ?? '').trim()

          seen.add(profileUrl)
          employees.push({ name, role, profile_url: profileUrl, dm: isDM(role) })
        })

        // Decisores primeiro
        employees.sort((a, b) => (b.dm ? 1 : 0) - (a.dm ? 1 : 0))
        const top = employees.filter(e => e.dm).length > 0
          ? employees.filter(e => e.dm)
          : employees
        return top.slice(0, 5).map(({ name, role, profile_url }) => ({ name, role, profile_url }))
      },
      args: [DECISION_KEYWORDS],
    })
    return result?.[0]?.result ?? []
  } catch {
    return []
  }
}

// ── Website text scraping ─────────────────────────────────────────────────────

async function scrapeWebsite(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.querySelectorAll('script,style,nav,header,footer,iframe,aside,form').forEach(el => el.remove())
        return (document.body?.innerText ?? '').replace(/\s{3,}/g, '\n').slice(0, 2000)
      },
    })
    return result?.[0]?.result ?? ''
  } catch {
    return ''
  }
}

// ── Loop principal de processamento ──────────────────────────────────────────

async function runCsvLoop() {
  const { queue, progress } = await csvGet(['queue', 'progress'])
  if (!queue?.length) return

  // Retoma do ponto onde pausou
  const startIdx = Math.max(0, (progress?.done ?? 0))

  let tabId = null

  try {
    for (let i = startIdx; i < queue.length; i++) {
      const { state } = await csvGet(['state'])
      if (state === 'paused') return

      const company = queue[i]
      console.log(`[CSV_AGENT] ${i + 1}/${queue.length}: ${company.nome}`)

      let linkedin_text      = ''
      let linkedin_employees = []
      let website_text       = ''

      // 1. Scrape LinkedIn: about text + navega para /people para decisores
      if (company.linkedin_url) {
        try {
          const baseUrl = company.linkedin_url.replace(/\/+$/, '')
          tabId = await csvOpenTab(baseUrl, 3000)

          // About text na página principal da empresa
          linkedin_text = await scrapeLinkedInAbout(tabId)

          // Navega para /people no mesmo tab
          const peopleUrl = baseUrl + '/people/'
          await chrome.tabs.update(tabId, { url: peopleUrl })
          await csvWaitForTab(tabId)
          await new Promise(r => setTimeout(r, 3500))
          linkedin_employees = await scrapeLinkedInPeople(tabId)

          console.log(`[CSV_AGENT] LinkedIn ${company.nome}: ${linkedin_employees.length} decisores`)
          await csvCloseTab(tabId); tabId = null
          await new Promise(r => setTimeout(r, randomDelay()))
        } catch (e) {
          console.log(`[CSV_AGENT] LinkedIn error para ${company.nome}:`, e?.message)
          if (tabId) { await csvCloseTab(tabId); tabId = null }
        }
      }

      // 2. Scrape website (se URL disponível)
      if (company.website) {
        try {
          tabId = await csvOpenTab(company.website, 2000)
          website_text = await scrapeWebsite(tabId)
          await csvCloseTab(tabId); tabId = null
          await new Promise(r => setTimeout(r, randomDelay()))
        } catch (e) {
          console.log(`[CSV_AGENT] Website error para ${company.nome}:`, e?.message)
          if (tabId) { await csvCloseTab(tabId); tabId = null }
        }
      }

      const enriched = {
        ...company,
        linkedin_text:      linkedin_text.slice(0, 1500),
        website_text:       website_text.slice(0, 1500),
        linkedin_employees: linkedin_employees.slice(0, 6),
      }

      // Adiciona ao buffer de resultados (cliente vai buscar no próximo poll)
      const { results: existing } = await csvGet(['results'])
      const results = existing ?? []
      results.push(enriched)

      await csvSet({
        results,
        progress: { done: i + 1, total: queue.length },
      })

      console.log(`[CSV_AGENT] ${company.nome} enriquecida (linkedin: ${linkedin_text.length} chars, site: ${website_text.length} chars)`)
    }
  } finally {
    if (tabId) { try { await csvCloseTab(tabId) } catch {} }
  }

  await csvSet({
    state:    'done',
    progress: { done: queue.length, total: queue.length },
  })

  console.log(`[CSV_AGENT] Concluído: ${queue.length} empresas processadas`)
}

// ── Listener de mensagens externas ────────────────────────────────────────────

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CSV_PING') {
    sendResponse({ ok: true, version: CSV_VERSION })
    return false
  }

  if (message.type === 'CSV_PROCESS_QUEUE') {
    ;(async () => {
      try {
        const { queue } = message
        if (!queue?.length) {
          sendResponse({ ok: false, error: 'queue vazia ou inválida' })
          return
        }

        await csvClear()
        await csvSet({
          state:        'scraping',
          queue,
          results:      [],
          progress:     { done: 0, total: queue.length },
          errorMessage: null,
        })

        sendResponse({ ok: true, total: queue.length })

        runCsvLoop().catch(async err => {
          console.error('[csv] loop error:', err)
          await csvSet({ state: 'error', errorMessage: String(err?.message ?? err) })
        })
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message ?? err) })
      }
    })()
    return true
  }

  if (message.type === 'CSV_GET_RESULTS') {
    ;(async () => {
      const data = await csvGet(['state', 'results', 'progress', 'errorMessage'])
      if (!data.state) { sendResponse({ ok: false }); return }

      sendResponse({
        ok:           true,
        state:        data.state,
        results:      data.results ?? [],
        progress:     data.progress   ?? { done: 0, total: 0 },
        errorMessage: data.errorMessage ?? null,
      })

      // Limpa buffer de resultados após entrega
      await csvSet({ results: [] })
    })()
    return true
  }

  if (message.type === 'CSV_PAUSE') {
    csvSet({ state: 'paused' })
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'CSV_RESUME') {
    ;(async () => {
      await csvSet({ state: 'scraping' })
      runCsvLoop().catch(async err => {
        await csvSet({ state: 'error', errorMessage: String(err?.message ?? err) })
      })
      sendResponse({ ok: true })
    })()
    return true
  }

  if (message.type === 'CSV_CLEAR') {
    csvClear()
    sendResponse({ ok: true })
    return false
  }

  return false
})
