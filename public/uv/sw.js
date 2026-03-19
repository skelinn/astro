importScripts('./uv.bundle.js')
importScripts('./uv.config.js')
importScripts('./uv.sw.js')

const sw = new UVServiceWorker()

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

async function handleRequest(event) {
  if (sw.route(event)) {
    return await sw.fetch(event)
  }
  return await fetch(event.request)
}

self.addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event))
})
