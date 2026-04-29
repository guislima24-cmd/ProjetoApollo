const API_BASE_DEV  = 'http://localhost:3000'
const API_BASE_PROD = 'https://projeto-apollo.vercel.app'

async function getApiBase() {
  const { useProduction } = await chrome.storage.local.get('useProduction')
  return useProduction ? API_BASE_PROD : API_BASE_DEV
}

const authStatusEl = document.getElementById('authStatus')
const queueSection = document.getElementById('queueSection')
const queueCountEl = document.getElementById('queueCount')
const syncBtn      = document.getElementById('syncBtn')
const openAppBtn   = document.getElementById('openAppBtn')
const leadsListEl  = document.getElementById('leadsList')

// ── Autenticação ───────────────────────────────────────────────────────────────

async function checkAuth() {
  const API_BASE = await getApiBase()
  try {
    const res = await fetch(`${API_BASE}/api/auth/session`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()

    if (data?.user?.memberTab) {
      authStatusEl.textContent = `✓ ${data.user.memberTab}`
      authStatusEl.className = 'status-value status-ok'

      const cookies = await chrome.cookies?.getAll({ url: API_BASE })
      const sessionCookie = cookies?.find(c =>
        c.name === 'next-auth.session-token' ||
        c.name === '__Secure-next-auth.session-token'
      )
      if (sessionCookie) {
        await chrome.runtime.sendMessage({
          type: 'SAVE_SESSION_TOKEN',
          token: sessionCookie.value,
        })
      }
    } else {
      authStatusEl.textContent = '✗ Não logado — abra o ProspectAI e faça login'
      authStatusEl.className = 'status-value status-error'
    }
  } catch (err) {
    authStatusEl.textContent = `⚠ Sem conexão com o servidor (${API_BASE})`
    authStatusEl.className = 'status-value status-warn'
    console.error('[ProspectAI] checkAuth error:', err)
  }
}

// ── Fila pendente ──────────────────────────────────────────────────────────────

async function checkQueue() {
  const { pendingQueue = [] } = await chrome.storage.local.get('pendingQueue')
  if (pendingQueue.length > 0) {
    queueSection.style.display = 'block'
    queueCountEl.textContent = `${pendingQueue.length} na fila`
  }
}

syncBtn?.addEventListener('click', async () => {
  syncBtn.textContent = 'Sincronizando...'
  syncBtn.disabled = true

  const API_BASE = await getApiBase()
  const { pendingQueue = [] } = await chrome.storage.local.get('pendingQueue')
  const failed = []

  for (const item of pendingQueue) {
    try {
      const res = await fetch(`${API_BASE}/api/prospection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(item),
      })
      if (!res.ok) failed.push(item)
    } catch {
      failed.push(item)
    }
  }

  await chrome.storage.local.set({ pendingQueue: failed })

  if (failed.length === 0) {
    queueSection.style.display = 'none'
    syncBtn.textContent = '✓ Sincronizado!'
  } else {
    queueCountEl.textContent = `${failed.length} na fila`
    syncBtn.textContent = 'Tentar novamente'
    syncBtn.disabled = false
  }
})

// ── Leads recentes ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['Aguardando', 'Respondeu', 'Reunião', 'Follow-up', 'Descartado']

function statusClass(status) {
  if (status === 'Aguardando' || status === 'Follow-up') return ''
  if (status === 'Respondeu' || status === 'Reunião')     return 'active'
  if (status === 'Descartado')                            return 'active-red'
  return ''
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  // dateStr é "dd/mm/aaaa" ou ISO
  return dateStr.length > 10 ? dateStr.slice(0, 10) : dateStr
}

async function updateStatus(rowIndex, status, itemEl) {
  const [{ sessionToken }, API_BASE] = await Promise.all([
    chrome.storage.local.get('sessionToken'),
    getApiBase(),
  ])
  const headers = { 'Content-Type': 'application/json' }
  if (sessionToken) headers['X-Session-Token'] = sessionToken

  try {
    const res = await fetch(`${API_BASE}/api/prospection/${rowIndex}`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ status }),
    })

    if (res.ok) {
      // Atualiza o storage local também
      const { recentLeads = [] } = await chrome.storage.local.get('recentLeads')
      const updated = recentLeads.map(l =>
        l.rowIndex === rowIndex ? { ...l, status } : l
      )
      await chrome.storage.local.set({ recentLeads: updated })

      // Atualiza os botões visualmente
      itemEl.querySelectorAll('.status-btn').forEach(btn => {
        btn.className = 'status-btn' + (btn.dataset.status === status ? ` ${statusClass(status) || 'active'}` : '')
      })
    }
  } catch (err) {
    console.error('[ProspectAI] updateStatus error:', err)
  }
}

function renderLeads(leads) {
  if (!leads.length) {
    leadsListEl.innerHTML = '<div class="no-leads">Nenhuma prospecção ainda</div>'
    return
  }

  leadsListEl.innerHTML = ''

  for (const lead of leads) {
    const item = document.createElement('div')
    item.className = 'lead-item'

    const canalClass = lead.canal === 'LinkedIn' ? 'canal-linkedin' : 'canal-email'
    const currentStatus = lead.status ?? 'Aguardando'

    item.innerHTML = `
      <div class="lead-header">
        <span class="lead-name" title="${lead.nome}">${lead.nome || '—'}</span>
        <span class="lead-canal ${canalClass}">${lead.canal || 'LinkedIn'}</span>
      </div>
      <div class="lead-sub">${lead.cargo || ''}${lead.cargo && lead.empresa ? ' · ' : ''}${lead.empresa || ''}</div>
      <div class="lead-actions">
        ${STATUS_OPTIONS.map(s => `
          <button class="status-btn${s === currentStatus ? ' ' + (statusClass(s) || 'active') : ''}"
                  data-status="${s}"
                  ${!lead.rowIndex || lead.rowIndex < 0 ? 'disabled title="rowIndex não disponível"' : ''}>
            ${s}
          </button>
        `).join('')}
      </div>
      <div class="lead-date">${formatDate(lead.dataEnvio || '')}</div>
    `

    if (lead.rowIndex && lead.rowIndex > 0) {
      item.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => updateStatus(lead.rowIndex, btn.dataset.status, item))
      })
    }

    leadsListEl.appendChild(item)
  }
}

async function loadRecentLeads() {
  const { recentLeads = [] } = await chrome.storage.local.get('recentLeads')
  if (recentLeads.length) renderLeads(recentLeads)

  try {
    const [{ sessionToken }, API_BASE] = await Promise.all([
      chrome.storage.local.get('sessionToken'),
      getApiBase(),
    ])
    const headers = {}
    if (sessionToken) headers['X-Session-Token'] = sessionToken

    const res = await fetch(`${API_BASE}/api/prospection`, {
      credentials: 'include',
      headers,
    })

    if (res.ok) {
      const data = await res.json()
      if (data.prospections?.length) {
        renderLeads(data.prospections.slice(0, 7))
      }
    }
  } catch {
    // offline — mantém o que já mostrou do storage
  }
}

// ── Ações ──────────────────────────────────────────────────────────────────────

openAppBtn?.addEventListener('click', async () => {
  const API_BASE = await getApiBase()
  chrome.tabs.create({ url: `${API_BASE}/dashboard` })
})

// ── Debug ──────────────────────────────────────────────────────────────────────

const debugBtn    = document.getElementById('debugBtn')
const debugResult = document.getElementById('debugResult')

debugBtn?.addEventListener('click', async () => {
  debugBtn.textContent = 'Extraindo...'
  debugBtn.disabled = true
  debugResult.style.display = 'none'

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.url?.includes('linkedin.com')) {
      debugResult.textContent = '⚠ Abra uma página do LinkedIn primeiro.'
      debugResult.style.display = 'block'
      return
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'DEBUG_EXTRACT' })

    if (response?.profile) {
      const { nome, cargo, empresa, contato } = response.profile
      debugResult.textContent = [
        `Nome:    ${nome    || '(vazio)'}`,
        `Cargo:   ${cargo   || '(vazio)'}`,
        `Empresa: ${empresa || '(vazio)'}`,
        `URL:     ${contato || response.url || '(vazio)'}`,
      ].join('\n')
    } else {
      debugResult.textContent = '⚠ Sem resposta do content script.'
    }
  } catch (err) {
    debugResult.textContent = `Erro: ${err.message}`
  } finally {
    debugResult.style.display = 'block'
    debugBtn.textContent = 'Testar extração de perfil'
    debugBtn.disabled = false
  }
})

// ── Toggle Dev / Produção ──────────────────────────────────────────────────────

const envToggle = document.getElementById('envToggle')

async function initEnvToggle() {
  const { useProduction } = await chrome.storage.local.get('useProduction')
  envToggle.checked = !!useProduction
}

envToggle?.addEventListener('change', async () => {
  await chrome.storage.local.set({ useProduction: envToggle.checked })
  // Re-verifica auth com o novo ambiente
  checkAuth()
})

// ── Init ───────────────────────────────────────────────────────────────────────

initEnvToggle()
checkAuth()
checkQueue()
loadRecentLeads()
