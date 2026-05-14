// agent-mode-linkedin.js — Envio semi-automático de conexões e mensagens no LinkedIn
// Prefixo "li_" em todas as chaves de storage.

const LI_VERSION = 1

async function liOpenTab(url, delayMs = 3000) {
  const tab = await chrome.tabs.create({ url, active: true })
  await new Promise(r => setTimeout(r, delayMs))
  return tab.id
}

async function liCloseTab(tabId) {
  try { await chrome.tabs.remove(tabId) } catch {}
}

async function liWaitForTab(tabId, timeoutMs = 20000) {
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

// ── Envio de conexão com nota ─────────────────────────────────────────────────

async function enviarConexao(tabId, nota) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (notaTexto) => {
      // Tenta clicar no botão "Conectar" do perfil
      const connectBtn = Array.from(document.querySelectorAll('button')).find(
        b => b.innerText?.trim().toLowerCase() === 'connect' ||
             b.innerText?.trim().toLowerCase() === 'conectar'
      )
      if (!connectBtn) return { ok: false, error: 'Botão Conectar não encontrado' }
      connectBtn.click()

      return new Promise(resolve => {
        setTimeout(() => {
          // Clica "Adicionar nota"
          const addNoteBtn = Array.from(document.querySelectorAll('button')).find(
            b => b.innerText?.toLowerCase().includes('add a note') ||
                 b.innerText?.toLowerCase().includes('adicionar nota')
          )
          if (!addNoteBtn) {
            // Sem nota — clica Enviar direto
            const sendBtn = Array.from(document.querySelectorAll('button')).find(
              b => b.innerText?.toLowerCase() === 'send' ||
                   b.innerText?.toLowerCase() === 'enviar'
            )
            if (sendBtn) { sendBtn.click(); resolve({ ok: true, semNota: true }) }
            else resolve({ ok: false, error: 'Modal de conexão não encontrado' })
            return
          }

          addNoteBtn.click()
          setTimeout(() => {
            const textarea = document.querySelector('textarea[name="message"]')
              ?? document.querySelector('.send-invite__custom-message')
            if (!textarea) { resolve({ ok: false, error: 'Campo de nota não encontrado' }); return }

            textarea.value = notaTexto
            textarea.dispatchEvent(new Event('input', { bubbles: true }))
            textarea.dispatchEvent(new Event('change', { bubbles: true }))

            setTimeout(() => {
              const sendBtn = Array.from(document.querySelectorAll('button')).find(
                b => b.innerText?.toLowerCase() === 'send' ||
                     b.innerText?.toLowerCase() === 'enviar'
              )
              if (sendBtn) { sendBtn.click(); resolve({ ok: true }) }
              else resolve({ ok: false, error: 'Botão Enviar não encontrado no modal' })
            }, 800)
          }, 800)
        }, 1200)
      })
    },
    args: [nota],
  })
  return result?.[0]?.result ?? { ok: false, error: 'Erro no scripting' }
}

// ── Envio de mensagem (boas-vindas / followup) ────────────────────────────────

async function enviarMensagem(tabId, mensagem) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (texto) => {
      const msgBox = document.querySelector('.msg-form__contenteditable')
        ?? document.querySelector('[data-placeholder]')
        ?? document.querySelector('[contenteditable="true"]')

      if (!msgBox) return { ok: false, error: 'Campo de mensagem não encontrado' }

      msgBox.focus()
      msgBox.innerText = texto
      msgBox.dispatchEvent(new InputEvent('input', { bubbles: true }))

      return new Promise(resolve => {
        setTimeout(() => {
          const sendBtn = document.querySelector('.msg-form__send-button')
            ?? Array.from(document.querySelectorAll('button')).find(
              b => b.getAttribute('type') === 'submit' ||
                   b.innerText?.toLowerCase().includes('send') ||
                   b.innerText?.toLowerCase().includes('enviar')
            )
          if (sendBtn) { sendBtn.click(); resolve({ ok: true }) }
          else resolve({ ok: false, error: 'Botão de envio não encontrado' })
        }, 600)
      })
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
        const ready = await liWaitForTab(tabId)
        if (!ready) {
          sendResponse({ ok: false, error: 'Timeout ao carregar página do LinkedIn' })
          return
        }

        let resultado
        if (action === 'enviar_conexao') {
          resultado = await enviarConexao(tabId, mensagem)
        } else if (action === 'enviar_mensagem') {
          resultado = await enviarMensagem(tabId, mensagem)
        } else {
          sendResponse({ ok: false, error: `action desconhecida: ${action}` })
          return
        }

        // Aguarda 1s para o LinkedIn processar antes de fechar
        await new Promise(r => setTimeout(r, 1000))
        await liCloseTab(tabId)
        tabId = null

        sendResponse(resultado)
      } catch (err) {
        console.error('[LI_AGENT] Erro:', err)
        if (tabId) { try { await liCloseTab(tabId) } catch {} }
        sendResponse({ ok: false, error: String(err?.message ?? err) })
      }
    })()
    return true  // async response
  }

  return false
})
