const API_BASE_DEV  = 'http://localhost:3000'
const API_BASE_PROD = 'https://projeto-apollo.vercel.app'

async function getApiBase() {
  const { useProduction } = await chrome.storage.local.get('useProduction')
  return useProduction ? API_BASE_PROD : API_BASE_DEV
}

// ── Fila local (caso offline ou sem sessão) ────────────────────────────────

async function getQueue() {
  const { pendingQueue = [] } = await chrome.storage.local.get('pendingQueue')
  return pendingQueue
}

async function addToQueue(payload) {
  const queue = await getQueue()
  queue.push({ ...payload, queuedAt: Date.now() })
  await chrome.storage.local.set({ pendingQueue: queue })
}

// ── Envio para a API ───────────────────────────────────────────────────────
// O background service worker NÃO compartilha o cookie store do browser.
// Por isso usamos o cookie next-auth.session-token que salvamos via popup.

async function getSessionToken() {
  const { sessionToken } = await chrome.storage.local.get('sessionToken')
  return sessionToken ?? null
}

async function saveRecentLead(lead) {
  const { recentLeads = [] } = await chrome.storage.local.get('recentLeads')
  // Mantém os 10 mais recentes, mais novo primeiro
  const updated = [lead, ...recentLeads].slice(0, 10)
  await chrome.storage.local.set({ recentLeads: updated })
}

function normalizeNameForMatch(name) {
  return (name ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

async function sendStatusUpdate(rowIndex, status) {
  const [token, apiBase] = await Promise.all([getSessionToken(), getApiBase()])
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['X-Session-Token'] = token
  const res = await fetch(`${apiBase}/api/prospection/${rowIndex}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status }),
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

async function sendToApi(payload) {
  const [token, apiBase] = await Promise.all([getSessionToken(), getApiBase()])

  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['X-Session-Token'] = token

  const res = await fetch(`${apiBase}/api/prospection`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      nome: payload.nome ?? '',
      empresa: payload.empresa ?? '',
      cargo: payload.cargo ?? '',
      setor: '',
      canal: 'LinkedIn',
      contato: payload.contato ?? '',
      mensagem_ia: '',
    }),
  })

  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  if (!data?.ok) return null
  return { ok: true, rowIndex: data.rowIndex ?? -1 }
}

// ── Listener principal ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SAVE_SESSION_TOKEN') {
    // Popup salva o token para o background conseguir usar
    chrome.storage.local.set({ sessionToken: message.token })
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'STATUS_UPDATE_BY_NAME') {
    ;(async () => {
      const { recentLeads = [] } = await chrome.storage.local.get('recentLeads')
      const normTarget = normalizeNameForMatch(message.nome)
      const lead = recentLeads.find(l => normalizeNameForMatch(l.nome) === normTarget)
      if (!lead || !lead.rowIndex || lead.rowIndex < 0) {
        sendResponse({ ok: false, reason: 'lead not found' })
        return
      }
      const result = await sendStatusUpdate(lead.rowIndex, message.status).catch(() => null)
      if (result?.ok) {
        const updated = recentLeads.map(l =>
          l.rowIndex === lead.rowIndex ? { ...l, status: message.status } : l
        )
        await chrome.storage.local.set({ recentLeads: updated })
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'ProspectAI — Status atualizado!',
          message: `${lead.nome}: ${message.status}`,
        })
      }
      sendResponse(result ?? { ok: false })
    })()
    return true
  }

  if (message.type !== 'PROSPECTION_DETECTED') return false

  const payload = message.payload

  ;(async () => {
    if (!navigator.onLine) {
      await addToQueue(payload)
      sendResponse({ queued: true })
      return
    }

    const result = await sendToApi(payload).catch(() => null)

    if (result?.ok) {
      // Salva o lead recente no storage para o popup exibir
      await saveRecentLead({ ...payload, rowIndex: result.rowIndex, savedAt: Date.now() })

      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'ProspectAI — Registrado!',
        message: `${payload.nome || 'Lead'} (${payload.empresa || 'LinkedIn'}) salvo na planilha.`,
      })
      sendResponse({ ok: true })
    } else {
      await addToQueue(payload)
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'ProspectAI — Na fila',
        message: 'Abra o popup da extensão e sincronize quando estiver logado.',
      })
      sendResponse({ queued: true })
    }
  })()

  return true
})

// ── Flush ao iniciar ───────────────────────────────────────────────────────

async function flushQueue() {
  const queue = await getQueue()
  if (!queue.length) return
  const failed = []
  for (const item of queue) {
    const ok = await sendToApi(item).catch(() => false)
    if (!ok) failed.push(item)
  }
  await chrome.storage.local.set({ pendingQueue: failed })
}

chrome.runtime.onInstalled.addListener(flushQueue)
chrome.runtime.onStartup.addListener(flushQueue)
