// Intercepta TODAS as respostas de API do Apollo e extrai listas de empresas
;(function () {
  if (window.__zp_intercept) return
  window.__zp_intercept = true
  window.__zp_companies = null
  window.__zp_debug     = []

  // Busca recursivamente qualquer array que pareça uma lista de empresas
  function findCompanyArray(obj, depth) {
    if (depth > 6 || !obj || typeof obj !== 'object') return null
    if (Array.isArray(obj)) {
      if (obj.length > 0 && obj[0] && typeof obj[0] === 'object') {
        const first = obj[0]
        // Critério: tem name + (id ou website_url ou industry ou estimated_num_employees)
        if (first.name && (first.id || first.website_url || first.industry || first.estimated_num_employees)) {
          return obj
        }
      }
      return null
    }
    for (const key of Object.keys(obj)) {
      const found = findCompanyArray(obj[key], depth + 1)
      if (found) return found
    }
    return null
  }

  function tryCapture(url, text) {
    try {
      const data = JSON.parse(text)
      const orgs = findCompanyArray(data, 0)
      if (orgs && orgs.length > 0) {
        window.__zp_companies = { organizations: orgs, _url: url }
        window.__zp_debug.push({ url, count: orgs.length, first: orgs[0]?.name })
      }
    } catch {}
  }

  // Intercepta fetch
  const _fetch = window.fetch
  window.fetch = function (input, init) {
    const url = (typeof input === 'string' ? input : input?.url ?? '') ?? ''
    // Ignora assets estáticos
    if (/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|map)(\?|$)/i.test(url)) {
      return _fetch.apply(this, arguments)
    }
    return _fetch.apply(this, arguments).then(function (res) {
      res.clone().text().then(function (text) { tryCapture(url, text) }).catch(function () {})
      return res
    })
  }

  // Intercepta XHR
  const _open = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    this._zp_url = String(url ?? '')
    return _open.apply(this, arguments)
  }
  const _send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function () {
    const url = this._zp_url ?? ''
    if (url && !/\.(js|css|png|jpg|svg|ico|woff|ttf|map)(\?|$)/i.test(url)) {
      this.addEventListener('load', function () {
        tryCapture(url, this.responseText)
      })
    }
    return _send.apply(this, arguments)
  }
})()
