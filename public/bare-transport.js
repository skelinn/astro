// Bare v2 HTTP transport for @tomphttp/bare-server-node
// Implements the BareTransport interface expected by bare-mux v2

export default class BareTransportV2 {
  constructor(bare = '/bare/') {
    this.bare = bare
    this.ready = true
  }

  async init() {}

  async request(remote, method, body, headers, _signal) {
    const port = remote.port || (remote.protocol === 'https:' || remote.protocol === 'wss:' ? '443' : '80')
    const nullBody = ['GET', 'HEAD'].includes(method.toUpperCase())

    // bare server uses setHost:false so Host must be explicit
    const requestHeaders = { host: remote.host, ...headers }

    const res = await fetch(this.bare + 'v2/', {
      method,
      headers: {
        'x-bare-host': remote.hostname,
        'x-bare-port': String(port),
        'x-bare-protocol': remote.protocol,
        'x-bare-path': remote.pathname + remote.search,
        'x-bare-headers': JSON.stringify(requestHeaders),
        'x-bare-forward-headers': 'accept-encoding, accept-language',
      },
      body: nullBody ? null : (body ?? null),
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-store',
    })

    const status = Number(res.headers.get('x-bare-status'))
    const statusText = res.headers.get('x-bare-status-text') || ''
    const rawHeaders = JSON.parse(res.headers.get('x-bare-headers') || '{}')

    return { body: res.body, headers: rawHeaders, status, statusText }
  }

  connect(url, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
    const port = url.port || (url.protocol === 'wss:' ? '443' : '80')

    // Construct WebSocket URL to bare server
    const bareWsURL = (() => {
      const u = new URL(this.bare + 'v2/', location.href)
      u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      return u.href
    })()

    // Register connection with bare server, receive an ID
    const metaPromise = fetch(this.bare + 'v2/ws-new-meta', {
      method: 'POST',
      headers: {
        'x-bare-host': url.hostname,
        'x-bare-port': String(port),
        'x-bare-protocol': url.protocol,
        'x-bare-path': url.pathname + url.search,
        'x-bare-headers': JSON.stringify(requestHeaders),
        'x-bare-forward-headers':
          'accept-encoding, accept-language, sec-websocket-extensions, sec-websocket-key, sec-websocket-version',
      },
      credentials: 'omit',
      mode: 'cors',
    }).then((r) => r.text())

    let ws = null

    metaPromise
      .then((id) => {
        ws = new WebSocket(bareWsURL, [id])
        ws.binaryType = 'arraybuffer'
        ws.onopen = () => onopen(protocols[0] || '')
        ws.onmessage = (e) => onmessage(e.data)
        ws.onclose = (e) => onclose(e.code, e.reason)
        ws.onerror = () => onerror(new Error('WebSocket error'))
      })
      .catch(onerror)

    return [(data) => ws?.send(data), (code, reason) => ws?.close(code, reason)]
  }
}
