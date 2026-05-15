// acceptance-detector.js — Detecta conexões aceitas no LinkedIn e marca o lead
// Ativado em: https://www.linkedin.com/mynetwork/*

const STORAGE_KEY = 'acceptanceReported'
const API_URL     = 'https://projeto-apollo.vercel.app/api/leads/check-acceptances'

async function getReported() {
  const { [STORAGE_KEY]: arr = [] } = await chrome.storage.local.get(STORAGE_KEY)
  return new Set(arr)
}

async function saveReported(set) {
  await chrome.storage.local.set({ [STORAGE_KEY]: [...set] })
}

function normalizeText(t) {
  return (t ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function extractConnections() {
  const connections = []
  const seen = new Set()

  // Página linkedin.com/mynetwork/invite-connect/connections/ — cards de conexão
  const cards = document.querySelectorAll('.mn-connection-card')
  for (const card of cards) {
    const nameEl = card.querySelector('.mn-connection-card__name')
    const linkEl = card.querySelector('a.mn-connection-card__link, a[href*="/in/"]')
    const nome   = nameEl?.innerText?.trim()
    if (!nome || seen.has(normalizeText(nome))) continue
    seen.add(normalizeText(nome))
    connections.push({ nome, profile_url: linkEl?.href ?? null })
  }

  // Fallback para outros layouts: links /in/ com nome visível
  if (!connections.length) {
    for (const link of document.querySelectorAll('a[href*="/in/"]')) {
      const href = link.href
      if (!href || seen.has(href)) continue
      seen.add(href)

      const nameEl = link.querySelector('span[aria-hidden="true"]')
        ?? link.closest('[data-view-name]')?.querySelector('.artdeco-entity-lockup__title')
      const nome = (nameEl?.innerText ?? link.innerText ?? '').split('\n')[0].trim()

      if (nome && nome.length > 2 && nome.length < 80) {
        connections.push({ nome, profile_url: href })
      }
    }
  }

  return connections
}

async function checkAndReport() {
  const connections = extractConnections()
  if (!connections.length) return

  const reported = await getReported()
  const novas = connections.filter(c => !reported.has(normalizeText(c.nome)))
  if (!novas.length) return

  try {
    const res = await fetch(API_URL, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:        JSON.stringify({ connections: novas }),
    })
    if (!res.ok) return

    const data = await res.json()
    if (data.atualizados > 0) {
      console.log(`[AcceptanceDetector] ${data.atualizados} lead(s) marcado(s) como conexao_aceita`)
    }

    // Registra todos como vistos (mesmo sem match) para não re-verificar
    for (const c of novas) reported.add(normalizeText(c.nome))
    await saveReported(reported)
  } catch (err) {
    console.warn('[AcceptanceDetector] Erro:', err)
  }
}

// Aguarda DOM carregar antes do primeiro scan
setTimeout(checkAndReport, 3000)

// Detecta navegação SPA dentro do LinkedIn
let lastUrl = window.location.href
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href
    if (window.location.href.includes('/mynetwork')) {
      setTimeout(checkAndReport, 3000)
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true })
