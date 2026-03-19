import { createServer } from 'http'
import { createBareServer } from '@tomphttp/bare-server-node'
import { readFileSync, existsSync } from 'fs'
import { resolve, extname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const PORT = process.env.PORT || 3001
const isDev = process.env.NODE_ENV !== 'production'
const distDir = resolve(__dirname, 'dist')

const bare = createBareServer('/bare/')

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0]
  if (urlPath === '/') urlPath = '/index.html'

  const filePath = resolve(distDir, '.' + urlPath)

  // Ensure path doesn't escape dist dir
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  if (existsSync(filePath)) {
    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
    res.end(readFileSync(filePath))
  } else {
    // SPA fallback
    const index = resolve(distDir, 'index.html')
    if (existsSync(index)) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(readFileSync(index))
    } else {
      res.writeHead(404)
      res.end('Not found')
    }
  }
}

const server = createServer((req, res) => {
  // Set UV SW header
  if (req.url?.includes('/uv/uv.sw.js')) {
    res.setHeader('Service-Worker-Allowed', '/')
  }

  if (bare.shouldRoute(req)) {
    bare.routeRequest(req, res)
    return
  }

  if (!isDev) {
    serveStatic(req, res)
    return
  }

  // In dev, Vite handles everything — this server only handles bare
  res.writeHead(204)
  res.end()
})

server.on('upgrade', (req, socket, head) => {
  if (bare.shouldRoute(req)) {
    bare.routeUpgrade(req, socket, head)
    return
  }

  socket.destroy()
})

server.listen(PORT, () => {
  console.log(`[server] Bare server on http://localhost:${PORT}`)
  if (isDev) console.log('[server] Dev mode — proxy /bare/ via Vite on :5173')
})
