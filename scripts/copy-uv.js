import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const uvDest = resolve(root, 'public/uv')
const publicDest = resolve(root, 'public')

const uvDist = resolve(root, 'node_modules/@titaniumnetwork-dev/ultraviolet/dist')
const bareMuxDist = resolve(root, 'node_modules/@mercuryworkshop/bare-mux/dist')

if (!existsSync(uvDist)) {
  console.log('[copy-uv] UV dist not found, skipping.')
  process.exit(0)
}

mkdirSync(uvDest, { recursive: true })

const uvFiles = ['uv.bundle.js', 'uv.sw.js', 'uv.handler.js', 'uv.client.js']
for (const file of uvFiles) {
  const src = resolve(uvDist, file)
  const dst = resolve(uvDest, file)
  if (existsSync(src)) {
    copyFileSync(src, dst)
    console.log(`[copy-uv] Copied ${file}`)
  } else {
    console.warn(`[copy-uv] Warning: ${file} not found at ${src}`)
  }
}

// Copy bare-mux SharedWorker
const bareMuxWorker = resolve(bareMuxDist, 'worker.js')
const bareMuxDst = resolve(publicDest, 'bare-mux-worker.js')
if (existsSync(bareMuxWorker)) {
  copyFileSync(bareMuxWorker, bareMuxDst)
  console.log('[copy-uv] Copied bare-mux-worker.js')
} else {
  console.warn('[copy-uv] Warning: bare-mux worker.js not found')
}
