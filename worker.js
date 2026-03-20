/**
 * Cloudflare Worker — Astro
 * Implements bare v2 HTTP/WebSocket proxy + serves static assets via ASSETS binding
 */

// Module-level map for WS meta (shared within a single isolate instance)
const wsMetas = new Map()

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/bare/')) {
      return handleBare(request, url)
    }

    return env.ASSETS.fetch(request)
  },
}

// ── CORS helpers ────────────────────────────────────────────────
function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-expose-headers': '*',
  }
}

function corsResponse(body, init = {}) {
  const headers = new Headers({ ...cors(), ...(init.headers || {}) })
  return new Response(body, { ...init, headers })
}

// ── Main bare router ────────────────────────────────────────────
async function handleBare(request, url) {
  if (request.method === 'OPTIONS') {
    return corsResponse(null, { status: 204 })
  }

  // Info
  if (url.pathname === '/bare/v2/' && request.method === 'GET' && request.headers.get('upgrade') !== 'websocket') {
    return corsResponse(
      JSON.stringify({ versions: ['v2'], language: 'Cloudflare Workers', maintainer: {}, project: {} }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }

  // WebSocket upgrade
  if (request.headers.get('upgrade') === 'websocket') {
    return handleWebSocket(request)
  }

  // WS meta registration
  if (url.pathname === '/bare/v2/ws-new-meta') {
    return handleWSMeta(request)
  }

  // HTTP proxy
  if (url.pathname === '/bare/v2/') {
    return handleHTTP(request)
  }

  return corsResponse('Not found', { status: 404 })
}

// ── HTTP proxy ──────────────────────────────────────────────────
async function handleHTTP(request) {
  const host     = request.headers.get('x-bare-host')
  const port     = request.headers.get('x-bare-port')
  const protocol = request.headers.get('x-bare-protocol')
  const path     = request.headers.get('x-bare-path') || '/'
  const rawHdrs  = request.headers.get('x-bare-headers') || '{}'
  const fwdList  = (request.headers.get('x-bare-forward-headers') || '')
    .split(',').map(h => h.trim()).filter(Boolean)

  const targetURL = `${protocol}//${host}:${port}${path}`
  const headers = new Headers(JSON.parse(rawHdrs))
  for (const name of fwdList) {
    const val = request.headers.get(name)
    if (val) headers.set(name, val)
  }

  const nullBody = ['GET', 'HEAD'].includes(request.method.toUpperCase())

  let res
  try {
    res = await fetch(targetURL, {
      method: request.method,
      headers,
      body: nullBody ? null : request.body,
      redirect: 'follow',
    })
  } catch (e) {
    return corsResponse(String(e), { status: 500 })
  }

  const resHdrMap = {}
  for (const [k, v] of res.headers.entries()) resHdrMap[k] = v

  return corsResponse(res.body, {
    status: 200,
    headers: {
      'x-bare-status':      String(res.status),
      'x-bare-status-text': res.statusText,
      'x-bare-headers':     JSON.stringify(resHdrMap),
    },
  })
}

// ── WebSocket meta ──────────────────────────────────────────────
async function handleWSMeta(request) {
  const id = crypto.randomUUID()
  wsMetas.set(id, {
    host:     request.headers.get('x-bare-host'),
    port:     request.headers.get('x-bare-port'),
    protocol: request.headers.get('x-bare-protocol'),
    path:     request.headers.get('x-bare-path') || '/',
    headers:  request.headers.get('x-bare-headers') || '{}',
    forward:  (request.headers.get('x-bare-forward-headers') || '')
      .split(',').map(h => h.trim()).filter(Boolean),
  })
  // Auto-clean after 30s
  setTimeout(() => wsMetas.delete(id), 30_000)

  return corsResponse(id, { status: 200, headers: { 'content-type': 'text/plain' } })
}

// ── WebSocket proxy ─────────────────────────────────────────────
async function handleWebSocket(request) {
  const protocols = (request.headers.get('sec-websocket-protocol') || '')
    .split(',').map(p => p.trim()).filter(Boolean)
  const id = protocols[0]

  if (!id || !wsMetas.has(id)) {
    return new Response('Missing or expired meta ID', { status: 400 })
  }

  const meta = wsMetas.get(id)
  wsMetas.delete(id)

  const wsProtocol = (meta.protocol === 'wss:' || meta.protocol === 'https:') ? 'wss:' : 'ws:'
  const targetURL  = `${wsProtocol}//${meta.host}:${meta.port}${meta.path}`

  const targetHeaders = new Headers(JSON.parse(meta.headers))
  for (const name of meta.forward) {
    const val = request.headers.get(name)
    if (val) targetHeaders.set(name, val)
  }

  // Connect to target via fetch upgrade
  let targetRes
  try {
    targetRes = await fetch(targetURL, {
      headers: { ...Object.fromEntries(targetHeaders), upgrade: 'websocket' },
    })
  } catch (e) {
    return new Response(String(e), { status: 502 })
  }

  const target = targetRes.webSocket
  if (!target) return new Response('Target did not upgrade to WebSocket', { status: 502 })
  target.accept()

  const { 0: client, 1: server } = new WebSocketPair()
  server.accept()

  // Bridge
  target.addEventListener('message', e => { try { server.send(e.data) } catch {} })
  server.addEventListener('message', e => { try { target.send(e.data) } catch {} })
  target.addEventListener('close', e => { try { server.close(e.code, e.reason) } catch {} })
  server.addEventListener('close', e => { try { target.close(e.code, e.reason) } catch {} })
  target.addEventListener('error', () => { try { server.close(1011, 'target error') } catch {} })
  server.addEventListener('error', () => { try { target.close(1011, 'client error') } catch {} })

  return new Response(null, { status: 101, webSocket: client })
}
