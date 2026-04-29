/**
 * interceptor.js — roda no contexto MAIN (mesma janela da página LinkedIn).
 *
 * Intercepta fetch e XHR para capturar chamadas de API do LinkedIn.
 * Usa window.postMessage (não CustomEvent) para cruzar a barreira MAIN→ISOLATED.
 */

;(function () {
  'use strict'

  if (window.__prospectAiInterceptor) return
  window.__prospectAiInterceptor = true

  console.log('[ProspectAI] Interceptor ativo.')

  function notify(type, url, body) {
    console.log('[ProspectAI] Notificando:', type, url)
    window.postMessage({ __prospectai: true, type, url, body: body ?? null }, '*')
  }

  function isMessageUrl(url, method) {
    return method === 'POST' && url.includes('/voyager/api/messaging/conversations/')
  }

  function isConnectionUrl(url, method) {
    return method === 'POST' && (
      url.includes('/voyager/api/growth/normInvitations') ||
      url.includes('/voyager/api/relationships/normInvitations') ||
      url.includes('/voyager/api/relationships/invitations') ||
      url.includes('/voyager/api/growth/connections') ||
      url.includes('/invitation') ||
      // Novo endpoint (LinkedIn 2025): rsc-action com sduiid de conexão
      url.includes('handlePostInteropConnection') ||
      url.includes('mynetwork.sendInvitation') ||
      url.includes('growth.connect')
    )
  }

  // ── Intercepta fetch ───────────────────────────────────────────────────────

  const _fetch = window.fetch.bind(window)

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url ?? ''
    const method = (init?.method ?? 'GET').toUpperCase()

    if (method === 'POST') console.log('[ProspectAI] fetch POST:', url)

    if (isMessageUrl(url, method)) {
      let body = null
      try { body = JSON.parse(init?.body) } catch { /* ignorar */ }
      notify('message-sent', url, body)
    } else if (isConnectionUrl(url, method)) {
      let body = null
      try { body = JSON.parse(init?.body) } catch { /* ignorar */ }
      notify('connection-sent', url, body)
    }

    return _fetch(input, init)
  }

  // ── Intercepta XHR (fallback) ──────────────────────────────────────────────

  const _open = XMLHttpRequest.prototype.open
  const _send = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__pai_method = method?.toUpperCase() ?? 'GET'
    this.__pai_url = url ?? ''
    return _open.apply(this, arguments)
  }

  XMLHttpRequest.prototype.send = function (body) {
    const { __pai_method: method, __pai_url: url } = this

    if (method === 'POST') console.log('[ProspectAI] XHR POST:', url)

    if (isMessageUrl(url, method)) {
      let parsed = null
      try { parsed = JSON.parse(body) } catch { /* ignorar */ }
      notify('message-sent', url, parsed)
    } else if (isConnectionUrl(url, method)) {
      let parsed = null
      try { parsed = JSON.parse(body) } catch { /* ignorar */ }
      notify('connection-sent', url, parsed)
    }

    return _send.apply(this, arguments)
  }
})()

