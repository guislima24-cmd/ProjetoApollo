// Roda em document_start no MAIN world — intercepta respostas da API do Apollo.io
;(function () {
  if (window.__zp_intercept) return
  window.__zp_intercept = true
  window.__zp_companies = null

  const URL_RE = /\/(mixed_companies|organizations|accounts)\/search/i

  const _fetch = window.fetch
  window.fetch = function (input, init) {
    const url = (typeof input === 'string' ? input : input?.url ?? input?.href) ?? ''
    return _fetch.apply(this, arguments).then(function (res) {
      if (URL_RE.test(url)) {
        res.clone().json().then(function (data) {
          if (data && (data.organizations || data.accounts || data.companies)) {
            window.__zp_companies = data
          }
        }).catch(function () {})
      }
      return res
    })
  }

  // Também intercepta XMLHttpRequest (caso Apollo use XHR em alguma versão)
  const _open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    this._zp_url = url
    return _open.apply(this, arguments)
  }
  const _send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function () {
    if (this._zp_url && URL_RE.test(this._zp_url)) {
      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText)
          if (data && (data.organizations || data.accounts || data.companies)) {
            window.__zp_companies = data
          }
        } catch {}
      })
    }
    return _send.apply(this, arguments)
  }
})()
