// reply-detector.js — Detecta respostas no LinkedIn Messaging e marca o lead como respondeu
// Ativado em: https://www.linkedin.com/messaging/

const SCAN_INTERVAL_MS = 30_000
const STORAGE_KEY      = 'respondeuReportados'

async function getReportados() {
  const { [STORAGE_KEY]: set = [] } = await chrome.storage.local.get(STORAGE_KEY)
  return new Set(set)
}

async function saveReportados(set) {
  await chrome.storage.local.set({ [STORAGE_KEY]: [...set] })
}

function myNameNormalized() {
  // O LinkedIn coloca o nome do usuário logado no elemento do perfil do header
  const el = document.querySelector('.global-nav__me-photo')
    ?? document.querySelector('[data-control-name="nav.settings"]')
  return (el?.getAttribute('alt') ?? '').toLowerCase().trim()
}

function normalizeText(t) {
  return (t ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function scanConversations() {
  // Cada thread no painel esquerdo
  const threads = document.querySelectorAll(
    '.msg-conversation-listitem, .msg-conversations-container__convo-item'
  )

  const replies = []

  for (const thread of threads) {
    // Nome do contato
    const nomeEl = thread.querySelector(
      '.msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names'
    )
    const nome = nomeEl?.innerText?.trim()
    if (!nome) continue

    // Última mensagem
    const ultimaMsgEl = thread.querySelector(
      '.msg-conversation-listitem__message-snippet, .msg-conversation-card__message-snippet'
    )
    const ultimaMsg = ultimaMsgEl?.innerText?.trim() ?? ''

    // Se a última mensagem foi "Você: ..." é minha — ignorar
    const myName = myNameNormalized()
    const msgNorm = normalizeText(ultimaMsg)

    const ehMinha =
      ultimaMsg.startsWith('Você:') ||
      ultimaMsg.startsWith('You:') ||
      (myName && msgNorm.startsWith(myName + ':'))

    if (!ehMinha && ultimaMsg.length > 0) {
      replies.push(nome)
    }
  }

  return replies
}

async function reportar(nome) {
  try {
    const res = await fetch('https://projeto-apollo.vercel.app/api/leads/marcar-respondeu', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ nome_decisor: nome }),
      credentials: 'include',
    })
    const data = await res.json()
    if (data.ok) {
      console.log(`[ReplyDetector] Marcado como respondeu: ${nome} (${data.lead_id})`)
    }
  } catch (err) {
    console.warn('[ReplyDetector] Erro ao reportar:', err)
  }
}

async function scan() {
  const reportados = await getReportados()
  const replies    = scanConversations()

  const novos = replies.filter(n => !reportados.has(normalizeText(n)))
  for (const nome of novos) {
    await reportar(nome)
    reportados.add(normalizeText(nome))
  }

  if (novos.length > 0) {
    await saveReportados(reportados)
  }
}

// Aguarda o DOM carregar antes do primeiro scan
setTimeout(scan, 3000)
setInterval(scan, SCAN_INTERVAL_MS)
