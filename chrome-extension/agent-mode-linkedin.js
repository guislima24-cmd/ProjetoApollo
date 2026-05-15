// agent-mode-linkedin.js — Envio semi-automático de conexões e mensagens no LinkedIn

const LI_VERSION = 2

// ── helpers ──────────────────────────────────────────────────────────────────

async function liOpenTab(url, delayMs = 3500) {
  const tab = await chrome.tabs.create({ url, active: true })
  await new Promise(r => setTimeout(r, delayMs))
  return tab.id
}

async function liCloseTab(tabId) {
  try { await chrome.tabs.remove(tabId) } catch {}
}

async function liWaitForTab(tabId, timeoutMs = 25000) {
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

// ── Envio de conexão SEM nota (conta gratuita do LinkedIn) ───────────────────

async function enviarConexao(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

      function findBtn(keywords) {
        return Array.from(document.querySelectorAll('button')).find(b => {
          const text = (b.innerText ?? b.textContent ?? '').trim().toLowerCase()
          return keywords.some(k => text === k || text.startsWith(k))
        })
      }

      // Captcha
      if (document.querySelector('#captcha-challenge, [data-test-id="challenge-form"], .core-rail__security-verification')) {
        return { ok: false, error: 'CAPTCHA detectado — resolva manualmente no LinkedIn' }
      }

      // Limite semanal (pode estar na página antes mesmo de clicar)
      const pageText = (document.body?.innerText ?? '').toLowerCase()
      if (
        pageText.includes('weekly invitation limit') ||
        pageText.includes('limite semanal de convites') ||
        pageText.includes('reached the limit') ||
        pageText.includes('atingiu o limite')
      ) {
        return { ok: false, error: 'LIMITE_SEMANAL: Limite semanal de convites do LinkedIn atingido' }
      }

      // Já conectado?
      if (findBtn(['message', 'mensagem', 'message this person'])) {
        return { ok: false, error: 'Já conectado com este perfil' }
      }

      // Convite pendente?
      if (findBtn(['pending', 'pendente', 'withdraw'])) {
        return { ok: false, error: 'Convite já enviado e aguardando resposta' }
      }

      // Botão Conectar
      const connectBtn = findBtn(['connect', 'conectar'])
      if (!connectBtn) return { ok: false, error: 'Botão Conectar não encontrado — verifique o perfil' }

      connectBtn.click()
      await sleep(1500)

      // Verifica se modal de limite apareceu após clicar
      const anyDialog = document.querySelector('[role="dialog"]')
      if (anyDialog) {
        const dialogText = (anyDialog.innerText ?? '').toLowerCase()
        if (dialogText.includes('limit') || dialogText.includes('limite')) {
          return { ok: false, error: 'LIMITE_SEMANAL: Limite semanal de convites do LinkedIn atingido' }
        }
      }

      // Envia direto SEM nota — "Send without a note" ou "Send"
      const sendBtn = findBtn(['send without a note', 'enviar sem nota', 'send', 'enviar'])
      if (sendBtn) { sendBtn.click(); return { ok: true } }

      return { ok: false, error: 'Modal de conexão não apareceu — verifique o LinkedIn' }
    },
    args: [],
  })
  return result?.[0]?.result ?? { ok: false, error: 'Erro no scripting' }
}

// ── Envio de mensagem (pitch / followup) ──────────────────────────────────────

async function enviarMensagem(tabId, mensagem) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (texto) => {
      function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

      // Captcha
      if (document.querySelector('#captcha-challenge, [data-test-id="challenge-form"]')) {
        return { ok: false, error: 'CAPTCHA detectado — resolva manualmente no LinkedIn' }
      }

      // Campo de mensagem (contenteditable do LinkedIn)
      const msgBox = document.querySelector('.msg-form__contenteditable[contenteditable="true"]')
        ?? document.querySelector('[data-placeholder][contenteditable="true"]')
        ?? document.querySelector('[contenteditable="true"]')

      if (!msgBox) return { ok: false, error: 'Campo de mensagem não encontrado — abra a conversa primeiro' }

      msgBox.focus()
      await sleep(300)

      // execCommand funciona com contenteditable React do LinkedIn
      document.execCommand('selectAll', false, null)
      document.execCommand('delete', false, null)
      document.execCommand('insertText', false, texto)
      msgBox.dispatchEvent(new InputEvent('input', { bubbles: true }))
      await sleep(900)

      // Botão enviar
      const sendBtn = document.querySelector('.msg-form__send-button[type="submit"]')
        ?? document.querySelector('button.msg-form__send-button')
        ?? Array.from(document.querySelectorAll('button[type="submit"]')).find(b =>
            (b.getAttribute('aria-label') ?? '').toLowerCase().includes('send') ||
            (b.innerText ?? '').trim().toLowerCase() === 'send' ||
            (b.innerText ?? '').trim().toLowerCase() === 'enviar'
          )

      if (!sendBtn) return { ok: false, error: 'Botão de envio não encontrado' }
      if (sendBtn.disabled) return { ok: false, error: 'Botão desabilitado — texto pode não ter sido inserido' }

      sendBtn.click()
      return { ok: true }
    },
    args: [mensagem],
  })
  return result?.[0]?.result ?? { ok: false, error: 'Erro no scripting' }
}

// ── Listener ──────────────────────────────────────────────────────────────────

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type === 'LI_PING') {
    sendResponse({ ok: true, version: LI_VERSION })
    return false
  }

  if (message.type === 'LI_SEND_REQUEST') {
    ;(async () => {
      const { action, mensagem, linkedin_url } = message

      if (!linkedin_url) {
        sendResponse({ ok: false, error: 'linkedin_url obrigatório' })
        return
      }

      let tabId = null
      try {
        tabId = await liOpenTab(linkedin_url, 3500)
        const ready = await liWaitForTab(tabId, 25000)
        if (!ready) {
          sendResponse({ ok: false, error: 'TIMEOUT: Página do LinkedIn demorou demais para carregar' })
          return
        }

        let resultado
        if (action === 'enviar_conexao') {
          resultado = await enviarConexao(tabId)
        } else if (action === 'enviar_mensagem') {
          resultado = await enviarMensagem(tabId, mensagem)
        } else {
          sendResponse({ ok: false, error: `action desconhecida: ${action}` })
          return
        }

        await new Promise(r => setTimeout(r, 1500))
        await liCloseTab(tabId)
        tabId = null

        sendResponse(resultado)
      } catch (err) {
        console.error('[LI_AGENT] Erro:', err)
        if (tabId) { try { await liCloseTab(tabId) } catch {} }
        sendResponse({ ok: false, error: String(err?.message ?? err) })
      }
    })()
    return true
  }

  return false
})
