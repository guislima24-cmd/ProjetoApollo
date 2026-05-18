// agent-mode-linkedin.js — Envio semi-automático de conexões e mensagens no LinkedIn

const LI_VERSION = 2

// ── helpers ──────────────────────────────────────────────────────────────────

async function liOpenTab(url, delayMs = 4000) {
  const tab = await chrome.tabs.create({ url, active: false })
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

async function enviarConexao(tabId, linkedin_url) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',   // acessa React internals para chamar onClick sem isTrusted
    func: async (expectedUrl) => { try {
      function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

      // Constrói fake SyntheticEvent com nativeEvent cujo isTrusted é sempre true.
      // Proxy intercepta o getter — o handler React não consegue distinguir de um clique real.
      function makeFakeEvent(el) {
        const r   = el.getBoundingClientRect()
        const cx  = r.left + r.width  / 2
        const cy  = r.top  + r.height / 2
        const real = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy })
        const nativeProxy = new Proxy(real, {
          get(t, p) {
            if (p === 'isTrusted') return true
            const v = t[p]
            return typeof v === 'function' ? v.bind(t) : v
          }
        })
        return {
          nativeEvent:            nativeProxy,
          isTrusted:              true,
          preventDefault:         () => {},
          stopPropagation:        () => {},
          persist:                () => {},
          isPropagationStopped:   () => false,
          isDefaultPrevented:     () => false,
          target:                 el,
          currentTarget:          el,
          bubbles:                true,
          cancelable:             true,
          type:                   'click',
          timeStamp:              performance.now(),
          clientX: cx, clientY: cy,
        }
      }

      function reactClick(el) {
        const evt = makeFakeEvent(el)

        // React 17+ — __reactProps$ no próprio elemento
        const propKey = Object.keys(el).find(k => k.startsWith('__reactProps$'))
        if (propKey && typeof el[propKey]?.onClick === 'function') {
          el[propKey].onClick(evt)
          return true
        }

        // Sobe na árvore — às vezes o handler fica num wrapper pai
        let cur = el.parentElement
        for (let i = 0; i < 6 && cur && cur !== document.body; i++) {
          const pk = Object.keys(cur).find(k => k.startsWith('__reactProps$'))
          if (pk && typeof cur[pk]?.onClick === 'function') {
            evt.currentTarget = cur
            cur[pk].onClick(evt)
            return true
          }
          cur = cur.parentElement
        }

        // React 16 fiber
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))
        if (fiberKey) {
          let fiber = el[fiberKey]
          while (fiber) {
            const props = fiber.memoizedProps || fiber.pendingProps
            if (typeof props?.onClick === 'function') {
              props.onClick(evt)
              return true
            }
            fiber = fiber.return
          }
        }

        // Último fallback: click nativo
        el.click()
        return false
      }

      // TreeWalker: busca em nós de texto do DOM — não depende de innerText,
      // offsetParent nem CSS. Funciona em dropdowns position:fixed do LinkedIn.
      // excludeSidebar=true: ignora aside E botões na faixa direita do viewport
      // (sidebar "Mais perfis para você" pode não estar em <aside> no DOM atual).
      function findByText(keywords, root, excludeSidebar) {
        const kws = keywords.map(k => k.toLowerCase())
        const walker = document.createTreeWalker(
          root ?? document.body, NodeFilter.SHOW_TEXT, null
        )
        let node
        while ((node = walker.nextNode())) {
          if (excludeSidebar && node.parentElement?.closest('aside, [role="complementary"]')) continue
          const t = (node.textContent ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
          if (!t || t.length > 100) continue
          if (kws.some(k => t === k || t.startsWith(k + ' ') || (t.includes(k) && t.length < 40))) {
            // Sobe no DOM até encontrar elemento clicável
            let el = node.parentElement
            for (let i = 0; i < 8 && el && el !== document.body; i++) {
              const tag  = (el.tagName  ?? '').toLowerCase()
              const role = (el.getAttribute('role') ?? '').toLowerCase()
              if (tag === 'button' || tag === 'a' || tag === 'artdeco-button' ||
                  role === 'menuitem' || role === 'option') {
                if (excludeSidebar) {
                  // Exclui botões na faixa direita do viewport (sidebar)
                  const rect = el.getBoundingClientRect()
                  if (rect.width > 0 && rect.left >= window.innerWidth * 0.68) break
                }
                return el
              }
              el = el.parentElement
            }
          }
        }
        // Fallback: aria-label contendo keyword
        const ariaEls = Array.from((root ?? document).querySelectorAll('[aria-label]'))
          .filter(el => !excludeSidebar || !el.closest('aside, [role="complementary"]'))
        return ariaEls.find(el => {
          if (excludeSidebar) {
            const rect = el.getBoundingClientRect()
            if (rect.width > 0 && rect.left >= window.innerWidth * 0.68) return false
          }
          const lbl = (el.getAttribute('aria-label') ?? '').toLowerCase()
          return kws.some(k => lbl === k || lbl.startsWith(k) || lbl.includes(' ' + k))
        }) ?? null
      }

      async function waitFor(keywords, maxMs, root, excludeSidebar) {
        const end = Date.now() + maxMs
        while (Date.now() < end) {
          const el = findByText(keywords, root, excludeSidebar)
          if (el) return el
          await sleep(500)
        }
        return null
      }

      const CONNECT_KWS = ['conectar', 'connect', 'convidar']
      const dbg = {}

      // ── Verificação de URL ────────────────────────────────────────────────────
      if (expectedUrl) {
        try {
          const expPath = new URL(expectedUrl).pathname.replace(/\/+$/, '').toLowerCase()
          const curPath = window.location.pathname.replace(/\/+$/, '').toLowerCase()
          if (curPath !== expPath && !curPath.startsWith(expPath + '/')) {
            // Apollo exporta URLs codificadas (/in/acoaadajwa4...) que o LinkedIn
            // redireciona para o vanity URL real (/in/pcalexandre).
            // Se ambas as paths são perfis LinkedIn (/in/...), o redirect é legítimo.
            const isProfilePath = (p) => /^\/in\/[a-z0-9_%-]+/.test(p)
            if (isProfilePath(expPath) && isProfilePath(curPath)) {
              dbg.redirectApollo = `${expPath} → ${curPath}`
            } else {
              return { ok: false, error: `URL incorreta: esperado ${expPath}, carregado ${curPath}` }
            }
          }
          dbg.urlOk = true
        } catch (_) { dbg.urlOk = 'skip' }
      }

      // Captcha
      if (document.querySelector('#captcha-challenge, [data-test-id="challenge-form"], .core-rail__security-verification')) {
        return { ok: false, error: 'CAPTCHA detectado — resolva manualmente no LinkedIn' }
      }

      // Limite semanal
      const pageText = (document.body?.textContent ?? '').toLowerCase()
      if (pageText.includes('weekly invitation limit') || pageText.includes('limite semanal de convites') ||
          pageText.includes('reached the limit')       || pageText.includes('atingiu o limite')) {
        return { ok: false, error: 'LIMITE_SEMANAL: Limite semanal de convites do LinkedIn atingido' }
      }

      // ── Aguarda h1 para confirmar que o perfil renderizou ────────────────────
      // LinkedIn é SPA — os botões aparecem depois do h1 estar no DOM.
      let h1El = null
      const h1Deadline = Date.now() + 10000
      while (Date.now() < h1Deadline) {
        h1El = document.querySelector('main h1, h1')
        if (h1El && h1El.textContent.trim()) break
        await sleep(500)
      }
      dbg.h1 = h1El ? h1El.textContent.trim().slice(0, 30) : 'null'

      // ── Identificação do container de ações do perfil ─────────────────────────
      const profileActionsEl =
        document.querySelector('.pvs-profile-actions') ??
        document.querySelector('.pv-top-card-v2-ctas') ??
        null

      const profileCard =
        profileActionsEl?.closest('section, article') ??
        h1El?.closest('section, article') ??
        document.querySelector('main > section:first-of-type') ??
        null

      if (profileCard?.closest('aside, [role="complementary"]')) {
        return { ok: false, error: 'profileCard está em aside — estrutura inesperada' }
      }

      dbg.profileActionsEl = profileActionsEl?.className?.slice(0, 40) ?? 'null'
      dbg.profileCard       = profileCard?.tagName ?? 'null'

      // Root de busca preferencial; pode ser null — nesse caso usamos busca global
      const searchRoot = profileActionsEl ?? profileCard ?? null

      // Helper: todos os botões fora de <aside> (evita sidebar / "Pessoas que você conheça")
      // Inclui artdeco-button — custom element do LinkedIn cujo <button> interno
      // fica em shadow DOM e não é encontrado por querySelectorAll('button').
      function buttonsOutsideAside() {
        return Array.from(document.querySelectorAll('button, [role="button"], artdeco-button'))
          .filter(b => !b.closest('aside, [role="complementary"]'))
      }

      // Match de texto robusto: pega "Conectar", "+ Conectar", "Convidar..." etc.
      function matchesConnect(el) {
        const t = (el.textContent ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
        const l = (el.getAttribute('aria-label') ?? '').toLowerCase()
        return CONNECT_KWS.some(k =>
          t === k || t.startsWith(k + ' ') || (t.includes(k) && t.length < 40) ||
          l === k || l.startsWith(k) || l.includes(' ' + k)
        )
      }

      // ── Caso 1: "Conectar" diretamente ───────────────────────────────────────
      let connectEl = null
      if (searchRoot) {
        connectEl = await waitFor(CONNECT_KWS, 4000, searchRoot, false)
        dbg.caso1_root = !!connectEl
      }
      // Fallback global: TreeWalker no body inteiro, excluindo aside e sidebar direita.
      // A sidebar "Mais perfis para você" pode não estar em <aside> no DOM do LinkedIn —
      // usamos posição X (>68% do viewport) para filtrá-la.
      if (!connectEl) {
        connectEl = await waitFor(CONNECT_KWS, 8000, document.body, true)
        dbg.caso1_global = !!connectEl
        dbg.viewport = window.innerWidth
      }

      // ── Caso 2: "Conectar" via botão "Mais" ──────────────────────────────────
      if (!connectEl) {
        const maisSource = searchRoot
          ? Array.from(searchRoot.querySelectorAll('button'))
          : buttonsOutsideAside()

        const maisBtn = maisSource.find(b => {
          const t = (b.textContent ?? '').trim().toLowerCase()
          const l = (b.getAttribute('aria-label') ?? '').toLowerCase()
          return t === 'mais' || t === 'more' || l === 'mais' || l === 'more' ||
                 l.includes('mais ações') || l.includes('more actions')
        })
        dbg.maisFound = !!maisBtn
        if (maisBtn) {
          dbg.maisBtnLbl = (maisBtn.getAttribute('aria-label') ?? maisBtn.textContent ?? '').trim().slice(0, 40)
          maisBtn.click()
          await sleep(1200)

          // Aguarda o menu aparecer com itens renderizados
          let menu = null
          const menuEnd = Date.now() + 3000
          while (Date.now() < menuEnd) {
            const m = document.querySelector('[role="menu"],[role="listbox"]')
            if (m && m.children.length > 0) { menu = m; break }
            await sleep(300)
          }
          dbg.menuFound = !!menu

          // Primeira tentativa: TreeWalker
          if (menu) connectEl = await waitFor(CONNECT_KWS, 2000, menu)

          // Fallback: varredura direta por textContent nos menus abertos
          // (TreeWalker falha quando LinkedIn usa div/span sem role="menuitem")
          if (!connectEl) {
            const allMenus = Array.from(document.querySelectorAll('[role="menu"],[role="listbox"]'))
            for (const m of allMenus) {
              const items = Array.from(m.querySelectorAll('[role="menuitem"], [role="option"], li, button, a'))
              const byRole = items.find(el => {
                const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
                return CONNECT_KWS.some(k => t === k || t.startsWith(k + ' ') || (t.includes(k) && t.length < 60))
              })
              if (byRole) { connectEl = byRole; break }

              // Último recurso: qualquer elemento filho cujo textContent seja exatamente a keyword
              const byText = Array.from(m.querySelectorAll('*')).find(el => {
                const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
                return CONNECT_KWS.some(k => t === k) && el.children.length === 0
              })
              if (byText) {
                // Sobe até um pai clicável
                let cur = byText.parentElement
                for (let i = 0; i < 6 && cur && cur !== document.body; i++) {
                  const r = (cur.getAttribute('role') ?? '').toLowerCase()
                  if (r === 'menuitem' || r === 'option' || r === 'button' ||
                      cur.tagName === 'BUTTON' || cur.tagName === 'A' || cur.tabIndex >= 0) {
                    connectEl = cur; break
                  }
                  cur = cur.parentElement
                }
                if (!connectEl) connectEl = byText  // usa o span mesmo
                break
              }
            }
            dbg.caso2_direct = !!connectEl
          }
          dbg.caso2 = !!connectEl
        } else {
          dbg.maisNaoEncontrado = true
        }
      }

      if (!connectEl) {
        return { ok: false, error: `Conectar não encontrado. DBG=${JSON.stringify(dbg)}` }
      }

      dbg.connectTag  = connectEl.tagName
      dbg.connectText = (connectEl.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)

      // Snapshot do textContent de todos os dialogs antes do clique
      const MODAL_SEL = '[role="dialog"],[role="alertdialog"]'
      const dialogsSnap = Array.from(document.querySelectorAll(MODAL_SEL))
        .map(d => ({ el: d, txt: (d.textContent ?? '').trim() }))
      dbg.dialogsAntes = dialogsSnap.length

      // Clica com reactClick (isTrusted Proxy) — fallback para .click()
      if (!reactClick(connectEl)) connectEl.click()

      const isSemNota = t => t.includes('sem nota') || t.includes('without a note')

      // Busca segura: começa pelos dialogs (subárvore limitada) e desce até 4 níveis
      // de shadow root sem iterar document.querySelectorAll('*').
      function findBtnSafe(root, match, depth) {
        if (!root || depth > 4) return null
        try {
          // Botões regulares nesta raiz
          for (const btn of root.querySelectorAll('button, [role="button"]')) {
            const t = (btn.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
            if (match(t)) return btn
          }
          // Elementos cujo textContent bate (artdeco-button etc.)
          // textContent inclui conteúdo de shadow roots abertas
          for (const el of root.querySelectorAll('*')) {
            const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
            if (match(t) && t.length < 60) {
              // Se tiver shadow root, pega o botão interno
              if (el.shadowRoot) {
                const inner = el.shadowRoot.querySelector('button, [role="button"]')
                if (inner) return inner
              }
              // Senão retorna o próprio elemento (pode ser clicável)
              if (['BUTTON','A'].includes(el.tagName) || el.getAttribute('role') === 'button') return el
            }
            // Desce no shadow root deste elemento
            if (el.shadowRoot) {
              const found = findBtnSafe(el.shadowRoot, match, depth + 1)
              if (found) return found
            }
          }
        } catch (_e) {}
        return null
      }

      let sendBtn = null
      const sendDeadline = Date.now() + 10000
      while (Date.now() < sendDeadline) {
        // Prioridade: busca dentro dos dialogs (subárvore menor)
        for (const d of document.querySelectorAll(MODAL_SEL)) {
          sendBtn = findBtnSafe(d, isSemNota, 0)
          if (sendBtn) break
        }
        // Fallback: busca no body
        if (!sendBtn) sendBtn = findBtnSafe(document.body, isSemNota, 0)
        if (sendBtn) break
        await sleep(500)
      }

      if (!sendBtn) {
        const dialogsNow = Array.from(document.querySelectorAll(MODAL_SEL))
          .map(d => (d.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)).join(' || ')
        return { ok: false, error: `Enviar sem nota não encontrado. dialogs=[${dialogsNow}]` }
      }

      // Clica com React + Proxy isTrusted; fallback nativo
      try { sendBtn.focus() } catch (_) {}
      await sleep(200)
      const usouReact = reactClick(sendBtn)

      // Aguarda modal fechar (conteúdo do dialog mudar de volta)
      const closeDeadline = Date.now() + 10000
      while (Date.now() < closeDeadline) {
        const inviteStillOpen = dialogsSnap.some(snap => {
          const cur = (snap.el.textContent ?? '').trim()
          return cur !== snap.txt && document.contains(snap.el)
        })
        if (!inviteStillOpen) break
        await sleep(300)
      }

      return { ok: true }
    } catch (scriptErr) {
      return { ok: false, error: `SCRIPT_EX: ${scriptErr?.message ?? scriptErr}` }
    } },
    args: [linkedin_url ?? null],
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
        // Abre em background para não roubar foco; espera 5 s para a rede carregar
        tabId = await liOpenTab(linkedin_url, 5000)
        // Ativa o tab — LinkedIn só renderiza os botões quando visibilityState='visible'
        await chrome.tabs.update(tabId, { active: true })
        await new Promise(r => setTimeout(r, 2000))

        let resultado
        if (action === 'enviar_conexao') {
          resultado = await enviarConexao(tabId, linkedin_url)
        } else if (action === 'enviar_mensagem') {
          resultado = await enviarMensagem(tabId, mensagem)
        } else {
          sendResponse({ ok: false, error: `action desconhecida: ${action}` })
          return
        }

        await new Promise(r => setTimeout(r, 3000))
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
