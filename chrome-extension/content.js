/**
 * content.js — roda no contexto ISOLATED (acesso ao chrome.runtime).
 *
 * Escuta CustomEvents disparados pelo interceptor.js (MAIN world) e,
 * quando detecta um envio, extrai os dados do perfil do lead do DOM
 * e envia para o background registrar na planilha.
 */

;(function () {
  'use strict'

  if (window.__prospectAiContent) return
  window.__prospectAiContent = true

  // ── Extração de dados do perfil ────────────────────────────────────────────

  /**
   * Tenta vários seletores em ordem até encontrar um que retorne texto.
   * Mais robusto que depender de um único class name do LinkedIn.
   */
  function queryText(...selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      const text = el?.textContent?.trim() || el?.getAttribute('aria-label')?.trim()
      if (text) return text
    }
    return ''
  }

  function parseHeadline(headline) {
    // Formatos comuns: "Cargo na Empresa" | "Cargo at Company" | "Cargo | Empresa"
    const seps = [' na ', ' at ', ' | ', ' - ', ' @ ', ' · ']
    for (const sep of seps) {
      const i = headline.indexOf(sep)
      if (i > 0) return [headline.slice(0, i).trim(), headline.slice(i + sep.length).trim()]
    }
    return [headline, '']
  }

  function extractProfileFromMessaging() {
    // Nome: link do perfil no header da conversa ativa
    const name = queryText(
      '.msg-entity-lockup__entity-title',
      '.msg-thread__link-to-profile .artdeco-entity-lockup__title',
      '[data-control-name="view_profile"] .artdeco-entity-lockup__title',
      '.msg-s-message-group__profile-link',
      '.msg-conversation-listitem__participant-names'
    )

    // Headline / cargo
    const headline = queryText(
      '.msg-entity-lockup__entity-info .msg-entity-lockup__entity-title + *',
      '.msg-thread__link-to-profile .artdeco-entity-lockup__subtitle',
      '.msg-entity-lockup__subtitle'
    )

    // URL do perfil
    const profileLink = (
      document.querySelector('.msg-thread__link-to-profile')?.href ||
      document.querySelector('a[href*="linkedin.com/in/"]')?.href ||
      ''
    )

    const [cargo, empresa] = parseHeadline(headline)
    return { nome: name, cargo, empresa, contato: profileLink }
  }

  // Extrai dados do JSON-LD que o LinkedIn injeta para SEO
  // Ex: { "@type": "Person", "name": "...", "jobTitle": "...", "worksFor": { "name": "..." } }
  function extractFromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent)
        const person = data?.['@type'] === 'Person' ? data
          : data?.mainEntity?.['@type'] === 'Person' ? data.mainEntity
          : null
        if (!person) continue
        const nome = person.name ?? ''
        const cargo = person.jobTitle ?? ''
        const empresa = person.worksFor?.name ?? person.affiliation?.name ?? ''
        if (nome) {
          console.log('[ProspectAI] JSON-LD encontrado:', { nome, cargo, empresa })
          return { nome, cargo, empresa }
        }
      } catch { /* JSON inválido */ }
    }
    return null
  }

  function extractProfileFromProfilePage() {
    // Página /in/* — o perfil é o próprio conteúdo da página

    // Abordagem 0: JSON-LD (mais confiável — dados estruturados para SEO)
    const jsonLd = extractFromJsonLd()
    if (jsonLd?.nome) {
      return { ...jsonLd, contato: window.location.href }
    }

    // ── Nome ─────────────────────────────────────────────────────────────────
    // LinkedIn NÃO usa h1 — nome vem do og:title ou título da aba

    let name = queryText(
      // Tenta DOM mesmo assim (pode mudar no futuro)
      'h1', 'h2.text-heading-xlarge', '.pv-top-card--list h1'
    )

    if (!name) {
      const og = document.querySelector('meta[property="og:title"]')?.content ?? ''
      const ogMatch = og.match(/^(.+?)\s*[|–\-]\s*LinkedIn/i)
      name = ogMatch?.[1]?.trim() ?? ''
      if (name) console.log('[ProspectAI] Nome via og:title:', name)
    }

    if (!name) {
      const titleMatch = document.title.match(/^\(\d+\)\s*(.+?)\s*[|–\-]\s*LinkedIn/i)
        ?? document.title.match(/^(.+?)\s*[|–\-]\s*LinkedIn/i)
      name = titleMatch?.[1]?.trim() ?? ''
      if (name) console.log('[ProspectAI] Nome via page title:', name)
    }

    // ── Headline / Cargo via body.innerText ──────────────────────────────────
    // O LinkedIn renderiza o nome e a headline como texto simples no DOM,
    // sem h1 nem classes estáveis. Localizamos o nome no innerText e pegamos
    // o bloco de texto logo abaixo.
    let headline = queryText(
      '.text-body-medium.break-words',
      '.ph5 .text-body-medium',
      '.pv-top-card--list .text-body-medium',
      '.pv-text-details__left-panel .text-body-medium'
    )

    if (!headline && name) {
      const bodyText = document.body.innerText ?? ''
      // Remove credenciais do nome para a busca (ex: "Kleber, CEA" → "Kleber")
      const searchName = name.split(/[,·]/)[0].trim()
      const idx = bodyText.indexOf(searchName)
      if (idx !== -1) {
        const after = bodyText.slice(idx + searchName.length)
        const lines = after.split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 5 && !l.match(/^[·•·]\s*\d/)) // ignora "· 3º"
        headline = lines[0] ?? ''
        if (headline) console.log('[ProspectAI] Headline via body text:', headline)
      }
    }

    // Cargo = primeira parte da headline (antes do primeiro separador)
    const cargo = headline.split(/\s*[|·]\s*/)[0].trim()

    // Empresa = 2ª linha não-vazia após "Experiência" (1ª é o cargo, 2ª é a empresa)
    // Formato LinkedIn: Cargo\nEmpresa · Tipo\nData\nLocal
    let empresa = ''
    const bodyText2 = document.body.innerText ?? ''
    const expBlock = bodyText2.match(/(?:Experiência|Experience)\s*\n([\s\S]{0,600})/)
    if (expBlock) {
      const lines = expBlock[1].split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 2 && !/^\d{1,2}\s+de\b/i.test(l) && !/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(l))
      // lines[0] = cargo, lines[1] = "Empresa · Tipo de vínculo"
      const companyLine = lines[1] ?? ''
      empresa = companyLine.split(/\s*·\s*/)[0].trim()
      if (empresa) console.log('[ProspectAI] Empresa via seção Experiência:', empresa)
    }

    // Fallback: tenta extrair da headline (formato "Cargo | Empresa")
    if (!empresa) {
      const [, emp] = parseHeadline(headline)
      empresa = emp
    }

    console.log('[ProspectAI] Extração final:', { nome: name, cargo, empresa, headline })
    return { nome: name, cargo, empresa, contato: window.location.href }
  }

  function extractProfile() {
    const path = window.location.pathname
    if (path.startsWith('/messaging')) return extractProfileFromMessaging()
    return extractProfileFromProfilePage()
  }

  // ── Debounce: evita disparar múltiplas vezes por ação ─────────────────────

  let lastSent = 0
  const DEBOUNCE_MS = 3000

  function dispatch(eventData) {
    const now = Date.now()
    if (now - lastSent < DEBOUNCE_MS) return
    lastSent = now

    const profile = extractProfile()
    if (!profile.nome) {
      console.warn('[ProspectAI] Perfil não encontrado no DOM.', { path: window.location.pathname })
      return
    }

    const payload = {
      ...profile,
      canal: 'LinkedIn',
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
      trigger: eventData.type,
    }

    console.log('[ProspectAI] Prospecção detectada:', payload)

    chrome.runtime.sendMessage({ type: 'PROSPECTION_DETECTED', payload })
  }

  // ── Escuta postMessage do interceptor.js (MAIN → ISOLATED) ───────────────
  // window.postMessage cruza a barreira de mundos de forma garantida no MV3.

  window.addEventListener('message', (e) => {
    if (e.source !== window) return
    if (!e.data?.__prospectai) return

    const { type } = e.data
    if (type === 'message-sent') {
      setTimeout(() => dispatch({ type: 'prospectai:message-sent' }), 500)
    } else if (type === 'connection-sent') {
      setTimeout(() => dispatch({ type: 'prospectai:connection-sent' }), 500)
    }
  })

  // ── Detecção via DOM: botão "Conectar" → "Pendente" ───────────────────────
  // Fallback para quando o LinkedIn muda o endpoint da API.
  // Quando o botão muda para "Pendente"/"Pending", a conexão foi confirmada.
  ;(function setupConnectionObserver() {
    // Registra botões que já estão "Pendente" ao carregar (não são novos)
    const alreadyPending = new Set(
      [...document.querySelectorAll('button')].filter(b =>
        /pendente|pending/i.test(b.textContent.trim())
      )
    )

    const observer = new MutationObserver(() => {
      const pendingBtns = [...document.querySelectorAll('button')].filter(b =>
        /pendente|pending/i.test(b.textContent.trim())
      )
      for (const btn of pendingBtns) {
        if (!alreadyPending.has(btn)) {
          alreadyPending.add(btn)
          console.log('[ProspectAI] Botão Pendente detectado via DOM — conexão enviada!')
          dispatch({ type: 'prospectai:connection-sent' })
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
  })()

  // ── Detecção de respostas e conexões aceitas ──────────────────────────────
  // Observa o DOM do LinkedIn para detectar notificações e mensagens recebidas.
  // Quando detectado, envia STATUS_UPDATE_BY_NAME para o background atualizar a planilha.
  ;(function setupStatusObserver() {
    let lastStatusDispatch = 0
    const STATUS_DEBOUNCE_MS = 8000
    const seenKeys = new Set()

    function dispatchStatusUpdate(nome, status) {
      const now = Date.now()
      if (now - lastStatusDispatch < STATUS_DEBOUNCE_MS) return
      lastStatusDispatch = now
      console.log('[ProspectAI] Status update detectado:', { nome, status })
      chrome.runtime.sendMessage({ type: 'STATUS_UPDATE_BY_NAME', nome, status })
    }

    function checkNotifications() {
      // Painel de notificações do LinkedIn — detecta conexão aceita ou mensagem recebida
      const candidates = document.querySelectorAll(
        '[data-notification-urn], .nt-card__text, .notification-card'
      )
      for (const el of candidates) {
        const key = el.getAttribute('data-notification-urn') ?? el.textContent?.trim().slice(0, 60)
        if (!key || seenKeys.has(key)) continue
        seenKeys.add(key)

        const text = el.textContent?.trim() ?? ''
        const connectionAccepted = /aceitou seu convite|accepted your invitation|conectou com você/i.test(text)
        const messageReceived = /enviou uma mensagem|sent you a message|respondeu à sua mensagem/i.test(text)
        if (!connectionAccepted && !messageReceived) continue

        // Extrai o nome: tenta elementos específicos, depois regex no texto
        const nameEl = el.querySelector('.t-bold, strong, .artdeco-entity-lockup__title, h3, [data-control-name="view_profile"]')
        let nome = nameEl?.textContent?.trim() ?? ''
        if (!nome) {
          const m = text.match(/^(.+?)\s+(?:aceitou|accepted|enviou|sent|conectou)/i)
          nome = m?.[1]?.trim() ?? ''
        }
        if (nome) dispatchStatusUpdate(nome, 'Respondeu')
      }
    }

    function checkInboundMessages() {
      if (!window.location.pathname.startsWith('/messaging')) return
      // Mensagens recebidas: grupo de mensagens não enviadas pelo usuário
      const inbound = document.querySelectorAll(
        '.msg-s-message-group--received:not([data-pai-seen])'
      )
      if (!inbound.length) return
      inbound[0].setAttribute('data-pai-seen', '1')

      const senderName = document.querySelector(
        '.msg-entity-lockup__entity-title, .msg-thread__link-to-profile .artdeco-entity-lockup__title'
      )?.textContent?.trim() ?? ''
      if (senderName) dispatchStatusUpdate(senderName, 'Respondeu')
    }

    const statusObserver = new MutationObserver(() => {
      checkNotifications()
      checkInboundMessages()
    })
    statusObserver.observe(document.body, { childList: true, subtree: true })
  })()

  // ── Botão de teste manual no popup ────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'DEBUG_EXTRACT') {
      const profile = extractProfile()
      sendResponse({ profile, url: window.location.href })
    }
    return true
  })

  console.log('[ProspectAI] Content script ativo.', window.location.pathname)
})()
